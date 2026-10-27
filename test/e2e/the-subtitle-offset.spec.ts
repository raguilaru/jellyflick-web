import type { APIRequestContext, Page } from '@playwright/test';
import { reachByArrowKeys } from './arrow-keys';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Shifting the subtitles, in a browser (#28, stories 96–102).
 *
 * Two things earn the browser, and nothing else here does:
 *
 * - **The panel really not covering the subtitle line** (story 101). happy-dom
 *   gives every element a zero-sized box, so the unit journey cannot measure
 *   it at all; this is the one acceptance criterion in the ticket that is a
 *   fact about a laid-out screen.
 * - **A remote really reaching the panel and adjusting with it** (story 98) —
 *   where an arrow key sends focus is geometry, and the keys the panel takes
 *   have to be taken off a navigator that is really installed.
 *
 * The arithmetic is `test/unit/the-subtitle-offset.test.ts`, the panel's own
 * behaviour `test/unit/the-subtitle-timing-panel.test.tsx`, and the journey
 * `test/unit/shifting-the-subtitles.test.tsx`.
 *
 * **It pauses before it opens the menu**, as #27's own browser test does. The
 * test video is six seconds long, so a Title left running would end — and
 * close the player — in the middle of walking a menu with arrow keys. Pausing
 * just under a second in also puts the first cue on the screen and keeps it
 * there, which is what makes the two boxes something to measure rather than a
 * window one frame wide. The panel is what must not pause the video, and
 * nothing in it does: that is pinned in the unit journey, where the press can
 * be checked against the element itself.
 */

const PASSWORD = 'correct horse';

async function signIn(page: Page): Promise<void> {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();
}

function positionIn(page: Page): Promise<number> {
  return page.evaluate(() => {
    const video = document.querySelector('video');
    return video === null ? -1 : video.currentTime;
  });
}

/**
 * Arrival, playing, paused inside its first cue, with the English subtitles on
 * and the Subtitle timing panel open. Everything up to the thing being tested.
 */
async function openArrival(page: Page): Promise<void> {
  await page
    .getByRole('list', { name: 'New on Jellyflick' })
    .getByRole('listitem', { name: 'Arrival' })
    .press('Enter');
  await expect(page.getByRole('heading', { name: 'Arrival', level: 1 })).toBeVisible();
}

/**
 * From the **title page**, which is where closing the player leaves a User:
 * the player is an overlay rather than an address, so there is no navigation to
 * undo and Home is not come back to.
 */
async function openSubtitleTiming(
  page: Page,
  options: { expectCue?: boolean } = {},
): Promise<void> {
  await page.getByRole('button', { name: 'Play', exact: true }).press('Enter');
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Seek through Arrival' })).toBeVisible();

  // Really playing before it is paused: the button reads "Pause" from the
  // moment the controls appear, so pressing it before the browser has started
  // would *start* the Title and the rest of this would race its six seconds.
  await expect.poll(() => positionIn(page), { timeout: 10_000 }).toBeGreaterThan(0.4);
  await page.getByRole('button', { name: 'Pause Arrival' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Play Arrival' })).toBeVisible();

  const open = page.getByRole('button', { name: 'Audio and subtitles for Arrival' });
  await reachByArrowKeys(page, open);
  await open.press('Enter');

  const picker = page.getByRole('dialog', { name: 'Audio and subtitles' });
  await expect(picker).toBeVisible();
  const english = picker.getByRole('group', { name: 'Subtitles' }).getByRole('button', {
    name: 'English',
  });
  await reachByArrowKeys(page, english);
  await english.press('Enter');
  /*
   * Waited for only where the test is about to measure the cue's box. Once an
   * offset is in force the first cue is drawn later than the moment this
   * paused at, so a playback that *already* has one has nothing on the screen
   * here — which is the whole point of that playback and not a failure.
   */
  if (options.expectCue !== false) {
    await expect(page.locator('.player__subtitles')).toContainText('Hello', { timeout: 10_000 });
  }

  // Subtitle timing is reached from the subtitle menu, which story 96 is
  // explicit about, and by direction alone like everything else in there.
  await page.getByRole('button', { name: 'Audio and subtitles for Arrival' }).press('Enter');
  await expect(picker).toBeVisible();
  const timing = picker.getByRole('button', { name: 'Subtitle timing' });
  await reachByArrowKeys(page, timing);
  await timing.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Subtitle timing' })).toBeVisible();
}

test.afterEach(async ({ request }: { request: APIRequestContext }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);
});

/**
 * Story 101, and the first of the ticket's acceptance criteria: a User
 * adjusting the subtitles has to be able to see them.
 *
 * The two boxes are measured rather than the CSS being read, because "does not
 * cover" is a relation between two laid-out rectangles and `align-self: start`
 * is only the mechanism that makes it true. It is checked at both widths the
 * suite runs — a panel that fits beside the cues on a desktop and lands on top
 * of them on a phone is exactly the failure this is for.
 */
test('does not cover the subtitle line, or the controls under it', async ({ page }) => {
  // Reseeded here rather than in `afterEach`: a stop report from the test
  // before this one can land after that hook has run, and the resume point it
  // leaves would start Arrival near the end of its six seconds.
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await signIn(page);
  await openArrival(page);
  await openSubtitleTiming(page);

  const panel = await page.getByRole('dialog', { name: 'Subtitle timing' }).boundingBox();
  const cue = await page.locator('.player__subtitles').boundingBox();
  const bar = await page.getByRole('slider', { name: 'Seek through Arrival' }).boundingBox();
  expect(panel).not.toBeNull();
  expect(cue).not.toBeNull();
  expect(bar).not.toBeNull();

  // Wholly above the cue, and so above the controls below it too.
  expect((panel?.y ?? 0) + (panel?.height ?? 0)).toBeLessThanOrEqual(cue?.y ?? 0);
  expect((panel?.y ?? 0) + (panel?.height ?? 0)).toBeLessThanOrEqual(bar?.y ?? 0);

  // And on the screen rather than off the top of it, which is the other way a
  // panel can fail to cover something.
  expect(panel?.y ?? -1).toBeGreaterThanOrEqual(0);
  const viewport = page.viewportSize();
  expect((panel?.x ?? 0) + (panel?.width ?? 0)).toBeLessThanOrEqual(viewport?.width ?? 0);
});

/**
 * Story 98 and the ticket's second criterion: the offset is adjusted with the
 * remote's own keys, and the picture shows the result while it plays.
 *
 * The *live* half is read off the cue rather than off the readout: shifting the
 * subtitles two tenths later at a position inside the second cue draws the
 * first one instead, which is a different line and not merely a gap. Nothing
 * here compares the readout with the video's position — they are two readings
 * of one moving number, and the readout is only ever asserted against what the
 * User pressed.
 */
test('is adjusted with the arrow keys, and the picture shows it at once', async ({ page }) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await signIn(page);
  await openArrival(page);
  await openSubtitleTiming(page);

  const panel = page.getByRole('dialog', { name: 'Subtitle timing' });
  // Focus came in with the panel, or Left and Right would be the navigator's
  // and would walk the controls behind it.
  await expect(panel.locator(':focus')).toBeVisible();

  // The arrow keys cannot leave the panel, in any direction: it is fixed inside
  // the player, which is fixed, so the panel is the flow (#7, #40).
  for (const key of ['ArrowUp', 'ArrowDown']) {
    await page.keyboard.press(key);
    await expect(panel.locator(':focus'), `${key} left the panel`).toBeVisible();
  }

  // Right is a step later, wherever focus is inside the panel.
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await expect(panel).toContainText('Subtitles 0.2 s later');

  // Two tenths of lateness at 3.1 seconds reads the file at 2.9, which is the
  // first cue where an unshifted playback draws the second. The player is
  // paused, so this is a state rather than a window: the seek puts the picture
  // where it stays.
  await page.evaluate(() => {
    const video = document.querySelector('video');
    if (video !== null) video.currentTime = 3.1;
  });
  await expect(page.locator('.player__subtitles')).toContainText('Hello');

  // And Left takes it back, which is the same cue going away again.
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowLeft');
  await expect(panel).toContainText('Subtitles in sync');
  await expect(page.locator('.player__subtitles')).toContainText('Goodbye');
});

/**
 * Stories 97 and 102: the ± buttons with hold-to-repeat, and the offset reaching
 * the Server so it applies next time and on another device.
 *
 * The *press* is a real pointer held down, which is the only place that is
 * true: the unit panel test drives the same ramp with fake timers, and a tap
 * that a browser answers with both a `pointerdown` and a `click` is exactly the
 * case a hand-written press cannot reproduce.
 */
test('repeats while a button is held, and the Server keeps the offset', async ({
  page,
  request,
  keyboardOnly,
}) => {
  test.skip(keyboardOnly, 'holding a button down is what this is about, and that is a pointer');
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await signIn(page);
  await openArrival(page);
  await openSubtitleTiming(page);

  const panel = page.getByRole('dialog', { name: 'Subtitle timing' });
  const later = page.getByRole('button', { name: 'Shift the subtitles later' });
  const box = await later.boundingBox();
  expect(box).not.toBeNull();

  await page.mouse.move(
    (box?.x ?? 0) + (box?.width ?? 0) / 2,
    (box?.y ?? 0) + (box?.height ?? 0) / 2,
  );
  await page.mouse.down();
  /*
   * Really held, for a real second. There is no way around waiting: "repeats
   * while it is held" is a statement about elapsed time, and a condition to
   * poll for instead would be satisfied by the press's own first step. The
   * ramp's exact figures are the unit test's, with literals; what is being
   * asked here is only that holding goes further than tapping, which is the
   * one thing fake timers cannot say.
   */
  await page.waitForTimeout(1_000);
  await page.mouse.up();

  const held = (await panel.textContent()) ?? '';
  const shifted = Number(/Subtitles (\d+\.\d) s later/.exec(held)?.[1] ?? '0');
  expect(shifted).toBeGreaterThan(0.1);

  // Letting go is what saves it, and the Server is where it goes (story 102).
  await expect
    .poll(() => storedOffsets(request), { timeout: 10_000 })
    .toEqual([{ file: 'stream:source-movie-arrival:3', seconds: shifted }]);

  /*
   * And it is applied next time without being asked. Back closes the panel
   * first and the player second — the claim stack is innermost-last — and the
   * second playback has no cue to wait for, because the offset it is about is
   * what moves the first one past the moment this pauses at.
   */
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog', { name: 'Subtitle timing' })).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeHidden();

  await openSubtitleTiming(page, { expectCue: false });

  await expect(page.getByRole('dialog', { name: 'Subtitle timing' })).toContainText(
    `Subtitles ${shifted.toFixed(1)} s later`,
  );
});

/**
 * **"Sync to this line" looks unavailable when it is** (#50).
 *
 * `aria-disabled` rather than `disabled` is the right call and is not in
 * question: the button stays a focus stop a remote can reach, and pressing it
 * says why nothing happened, where `disabled` would remove it from the arrow
 * keys with nothing to explain the gap. But a screen reader was the only one
 * being told — the only `aria-disabled` styling in `base.css` was scoped to
 * `.player__track-group`, and the timing **panel** is a different element, so a
 * sighted User found out by pressing it and reading a notice.
 *
 * This is a browser test because it is a fact about **computed style**: the
 * unit journey loads no stylesheet at all, so the dim is invisible there in the
 * strongest sense. It is asserted as the rule — the control that cannot be
 * pressed is dimmer than the one beside it that can, and is not dimmed while it
 * *can* be pressed — rather than against the figure in the file, which is a
 * look and not a promise.
 */
test('dims "Sync to this line" while there is no line to sync to', async ({ page }) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await signIn(page);
  await openArrival(page);
  await openSubtitleTiming(page);

  const panel = page.getByRole('dialog', { name: 'Subtitle timing' });
  const sync = panel.getByRole('button', { name: 'Sync to this line' });

  /*
   * Reset sits beside it in the same row, is the same kind of button, and is
   * always pressable — so it is what "dimmer" is measured against, rather than
   * the figure in `base.css`, which is a look and not a promise.
   */
  const opacityOf = (name: string): Promise<number> =>
    panel
      .getByRole('button', { name, exact: true })
      .evaluate((node) => Number(getComputedStyle(node).opacity));

  /*
   * The panel was opened paused inside the first cue (0.5–3 s), so there is a
   * line on the screen: the button can be pressed, and must not be dimmed.
   * Without this half the test would pass against a rule that dimmed every
   * button in the player.
   */
  await expect(sync).not.toHaveAttribute('aria-disabled', 'true');
  expect(await opacityOf('Sync to this line')).toBe(await opacityOf('Reset'));

  // Before the first cue, with the player still paused: nothing on the screen
  // to sync to, which is a state rather than a window one frame wide.
  await page.evaluate(() => {
    const video = document.querySelector('video');
    if (video !== null) video.currentTime = 0.2;
  });
  await expect(sync).toHaveAttribute('aria-disabled', 'true');

  // Still a focus stop a remote can reach — the whole reason it is
  // `aria-disabled` and not `disabled` — and now visibly unavailable.
  await reachByArrowKeys(page, sync);
  await expect(sync).toBeFocused();
  const dimmed = await opacityOf('Sync to this line');
  expect(dimmed).toBeLessThan(await opacityOf('Reset'));
  expect(dimmed).toBeLessThan(1);
});

/** What the Server is holding for Rafael, as the offsets it was sent. */
async function storedOffsets(request: APIRequestContext): Promise<unknown> {
  const state = (await (await request.get(`${FAKE_JELLYFIN_URL}/__fake/state`)).json()) as {
    displayPreferences?: Record<string, Record<string, string>>;
  };
  const stored =
    state.displayPreferences?.['jellyflick|jellyflick|user-rafael']?.['jf.subtitleOffsets'];
  return stored === undefined ? undefined : JSON.parse(stored);
}
