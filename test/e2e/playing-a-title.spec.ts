import type { APIRequestContext, Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Playing something for real: a browser decoding real bytes, reporting real
 * progress, and resuming where it was left.
 *
 * This is the one thing no unit test can do. happy-dom has a media element that
 * remembers a `currentTime` but decodes nothing, so "the picture really moved"
 * and "hls.js was never fetched" are both only observable here.
 *
 * The fake Jellyfin serves six seconds of VP9 in WebM
 * (`test/fake-jellyfin/media/test-video.webm`, drawn by
 * `scripts/make-test-video.mjs`). VP9 because plain Chromium ships no H.264
 * decoder — an MP4 would not play in the browser Playwright runs — and Arrival
 * is the sample Title the Server claims is WebM, so it direct-plays.
 */

const PASSWORD = 'correct horse';

type Report = { method: string; path: string; body: Record<string, unknown> };

test.afterEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/requests`);
});

async function signIn(page: Page): Promise<void> {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();
}

/** Opens Arrival and presses Play. Enter throughout, so a remote could do it. */
async function playArrival(page: Page): Promise<void> {
  await page
    .getByRole('list', { name: 'New on Jellyflick' })
    .getByRole('listitem', { name: 'Arrival' })
    .press('Enter');
  await expect(page.getByRole('heading', { name: 'Arrival', level: 1 })).toBeVisible();
  await page.getByRole('button', { name: 'Play', exact: true }).press('Enter');
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();
}

async function reportsTo(request: APIRequestContext, path: string): Promise<Report[]> {
  const writes = (await (await request.get(`${FAKE_JELLYFIN_URL}/__fake/writes`)).json()) as Report[];
  return writes.filter((write) => write.path === path);
}

/** A reported `PositionTicks` as seconds, for comparing against the element. */
function secondsOf(ticks: unknown): number {
  return typeof ticks === 'number' ? ticks / 10_000_000 : -1;
}

/** Where the `<video>` has got to, which is the proof it really decoded. */
function positionIn(page: Page): Promise<number> {
  return page.evaluate(() => {
    const video = document.querySelector('video');
    return video === null ? -1 : video.currentTime;
  });
}

test('plays a Title and tells the Server how far the User has got', async ({ page, request }) => {
  await signIn(page);
  await playArrival(page);

  // The picture really moves: a decoder that refused would leave this at zero.
  await expect.poll(() => positionIn(page), { timeout: 10_000 }).toBeGreaterThan(0.4);

  const started = await reportsTo(request, '/Sessions/Playing');
  expect(started).toHaveLength(1);
  expect(started[0]?.body).toMatchObject({
    ItemId: 'movie-arrival',
    PlaySessionId: 'play-session-movie-arrival',
    PlayMethod: 'DirectPlay',
    IsPaused: false,
  });

  // Pausing is news, so it is reported at once rather than at the next tick.
  await page.getByRole('button', { name: 'Pause Arrival' }).press('Enter');

  await expect
    .poll(async () => (await reportsTo(request, '/Sessions/Playing/Progress')).length)
    .toBeGreaterThan(0);
  const progress = await reportsTo(request, '/Sessions/Playing/Progress');
  const last = progress[progress.length - 1]?.body;
  expect(last).toMatchObject({ IsPaused: true, PlaySessionId: 'play-session-movie-arrival' });
  expect(last?.PositionTicks as number).toBeGreaterThan(0);
});

test('does not fetch hls.js to play a file the browser can take', async ({ page, request }) => {
  const chunks: string[] = [];
  page.on('request', (asked) => {
    if (asked.url().includes('hls')) chunks.push(asked.url());
  });

  await signIn(page);
  await playArrival(page);
  await expect.poll(() => positionIn(page), { timeout: 10_000 }).toBeGreaterThan(0.4);

  // The lightness constraint is about the bundle a TV downloads, and hls.js is
  // by far the largest thing the app could ship. A direct play must never
  // fetch it.
  expect(chunks).toEqual([]);
  // And the start really was a direct play, or this would prove nothing.
  expect((await reportsTo(request, '/Sessions/Playing'))[0]?.body).toMatchObject({
    PlayMethod: 'DirectPlay',
  });
});

test('reports where it stopped, and resumes there next time', async ({ page, request }) => {
  await signIn(page);
  await playArrival(page);
  await expect.poll(() => positionIn(page), { timeout: 10_000 }).toBeGreaterThan(1);

  const stoppedAt = await positionIn(page);
  await page.getByRole('button', { name: 'Close' }).press('Enter');

  await expect
    .poll(async () => (await reportsTo(request, '/Sessions/Playing/Stopped')).length)
    .toBe(1);
  const stopped = (await reportsTo(request, '/Sessions/Playing/Stopped'))[0]?.body;
  expect(stopped).toMatchObject({ ItemId: 'movie-arrival', Failed: false });
  expect(stopped?.PositionTicks as number).toBeGreaterThan(0);

  // The player is gone and the title page is still behind it.
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Arrival', level: 1 })).toBeVisible();

  // Now the Server holds a resume point, and Play honours it **without
  // leaving the page or reloading it**. Closing the player is not a
  // navigation, so the page has to ask the Server again itself — an earlier
  // version of this test reloaded here, which hid the fact that a second Play
  // on the page the User was already on replayed the film from the beginning.
  await page.getByRole('button', { name: 'Play', exact: true }).press('Enter');
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();

  // The *start report* is what pins this, not the element's position. The test
  // video is six seconds long, so a playback that restarted at zero reaches
  // any later position within the poll window too — which is why watching
  // `currentTime` cannot tell "resumed at four seconds" from "started again
  // and got there". What the player told the Server it was starting from can.
  await expect
    .poll(async () => (await reportsTo(request, '/Sessions/Playing')).length)
    .toBe(2);
  const restarted = (await reportsTo(request, '/Sessions/Playing'))[1]?.body;
  expect(secondsOf(restarted?.PositionTicks)).toBeGreaterThanOrEqual(stoppedAt - 0.5);

  // And the picture really moved on from there.
  await expect.poll(() => positionIn(page), { timeout: 10_000 }).toBeGreaterThan(stoppedAt);
});

test('closes on the Back key and leaves the title page where it was', async ({ page }) => {
  await signIn(page);
  await playArrival(page);
  await expect.poll(() => positionIn(page), { timeout: 10_000 }).toBeGreaterThan(0.4);

  // Back is the one Back handler everywhere in this app; the player claims it
  // the way the User Picker and the title-page pop-up do.
  await page.keyboard.press('Escape');

  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeHidden();
  await expect(page.getByRole('heading', { name: 'Arrival', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/title\/movie-arrival$/);
});

test('covers the screen, over the title page rather than beside it', async ({ page }) => {
  await signIn(page);
  await playArrival(page);

  const player = page.getByRole('region', { name: 'Playing Arrival' });
  const box = await player.boundingBox();
  const viewport = page.viewportSize();
  expect(box?.width).toBeCloseTo(viewport?.width ?? 0, 0);
  expect(box?.height).toBeCloseTo(viewport?.height ?? 0, 0);
  expect(await player.evaluate((node) => getComputedStyle(node).position)).toBe('fixed');
});

/**
 * The controls (#26), driven by nothing but keys. This test earns its place in
 * a browser three times over: focus really moving between the controls, the
 * length coming from the file the element decoded rather than from the
 * Server's library, and the controls really taking themselves off the picture
 * after a while — none of which happens in happy-dom.
 *
 * The test video is six seconds long, which is the clock this test runs
 * against: it seeks back to the start before waiting for the controls to hide,
 * so the wait finishes before the Title does.
 */
test('is driven from the keyboard alone: the bar, the length and the controls coming back', async ({
  page,
}) => {
  await signIn(page);
  await playArrival(page);

  const player = page.getByRole('region', { name: 'Playing Arrival' });
  const bar = page.getByRole('slider', { name: 'Seek through Arrival' });
  await expect(bar).toBeVisible();

  // The Server's library says Arrival is 116 minutes; the file the fake really
  // serves is six seconds, and the element's own answer is the one in front of
  // the User, so it wins as soon as the metadata is read.
  await expect(bar).toHaveAttribute('aria-valuemax', '6');

  // The player takes focus as soon as there is something to control. Until
  // then focus is still on the title page's Play button, *behind* the picture,
  // and an arrow key there would walk the page nobody can see.
  await expect(page.getByRole('button', { name: 'Pause Arrival' })).toBeFocused();

  // Up from the buttons is the bar, and Right on the bar is a seek — the
  // navigator moves focus between the controls, and the bar's own arrow keys
  // are taken from it before it can.
  await page.keyboard.press('ArrowUp');
  await expect(bar).toBeFocused();

  /*
   * Held still before the seek, because the bar and the clock beside it are
   * two readings of **one** number — the element's position — and a
   * six-second film moves that number on between them. A seek lands exactly a
   * second short of the end, so the readout says `-0:01` for as long as the
   * position stays where the seek put it and `-0:00` from the first frame
   * after: running, that is a window a few milliseconds wide, which is why
   * this passed on a developer's machine and never once on CI. Paused, the
   * position is exactly the clamp and both readings are exact.
   *
   * `PlayPause` rather than the Pause button, so focus stays on the bar —
   * which is where the seek below has to arrive.
   */
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Play Arrival' })).toBeVisible();

  await page.keyboard.press('ArrowRight');

  // Ten seconds into a six-second file lands a second short of the end:
  // seeking to the very end fires `ended`, and a User pressing Right has not
  // asked to leave the player.
  await expect(bar).toHaveAttribute('aria-valuenow', '5');
  await expect(player).toBeVisible();
  await expect(page.getByText('-0:01')).toBeVisible();

  await page.keyboard.press('ArrowLeft');
  await expect(bar).toHaveAttribute('aria-valuenow', '0');

  // Playing again, because a paused player keeps its controls up on purpose
  // (#26) and the wait below is for them going away.
  await page.keyboard.press('Space');
  await expect(page.getByRole('button', { name: 'Pause Arrival' })).toBeVisible();

  // Now nothing is pressed, and the controls get out of the way. The press
  // above put the Title back at the beginning, so there are six seconds of it
  // left to play out while this waits.
  await expect(bar).toBeHidden({ timeout: 5_000 });
  await expect(player).toBeVisible();

  // Any key brings them back, and focus comes back with them: a control the
  // User has just asked for is where the next press should land.
  await page.keyboard.press('ArrowUp');
  await expect(bar).toBeVisible();
  await expect(page.getByRole('button', { name: /^(Pause|Play) Arrival$/ })).toBeFocused();

  // And it really is still playing, rather than a still frame with chrome on.
  await page.getByRole('button', { name: 'Pause Arrival' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Play Arrival' })).toBeVisible();
});

/**
 * The sound and the subtitles (#27), driven by nothing but keys.
 *
 * This test is in a browser for the two things happy-dom cannot have: **where
 * an arrow key really sends focus** — every element there has a zero-sized box,
 * so the unit journey can only say each choice is a named focus stop — and a
 * cue **really painted over the picture**, which needs a layout to be true of.
 *
 * It pauses before opening the menu. The test video is six seconds long, so a
 * Title left running would end — and close the player — somewhere in the middle
 * of walking a menu with arrow keys. A paused player also keeps its controls
 * up, which is the behaviour #26 already promises.
 */
test('chooses the subtitles with the arrow keys, and draws them over the picture', async ({
  page,
  request,
}) => {
  /*
   * Reseeded **here** rather than left to `afterEach`, and that is not
   * belt-and-braces. Closing a player reports where it stopped, and a report
   * from the test before this one can land *after* its `afterEach` has already
   * reseeded — the browser context outlives the hook. The resume point that
   * leaves behind would start Arrival near the end of its six seconds, and this
   * test would then run the film out while walking the menu and find the player
   * gone. Reseeding once the previous context is really closed is what makes
   * "Arrival starts at the beginning" true rather than likely.
   */
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);

  await signIn(page);
  await playArrival(page);
  await expect(page.getByRole('slider', { name: 'Seek through Arrival' })).toBeVisible();

  // Really playing before it is paused. The button reads "Pause" from the
  // moment the controls appear, so pressing it while the browser has not
  // started yet would *start* the Title rather than stop it, and the rest of
  // this test would then be racing the six seconds it runs for.
  await expect.poll(() => positionIn(page), { timeout: 10_000 }).toBeGreaterThan(0.4);
  await page.getByRole('button', { name: 'Pause Arrival' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Play Arrival' })).toBeVisible();

  // Paused just under a second in, which is inside the first cue's window —
  // and it stays there however long walking the menu takes, which is why this
  // test pauses rather than seeking back afterwards.

  /*
   * The arrow keys cannot leave the player, in any direction, however little
   * there is that way inside it. The player covers the screen, so a press that
   * escaped would focus something the User cannot see — and on a phone the
   * buttons sit in a column, so Right really does have nothing beside it.
   * Before #27 narrowed the rule in `src/navigation/spatial-navigation.ts`,
   * this landed on a card on the title page behind the picture.
   */
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
    await page.keyboard.press(key);
    expect(
      await page.evaluate(() => document.activeElement?.closest('.player') !== null),
      `${key} left the player`,
    ).toBe(true);
  }

  // The control is reached from the one focus is already on, by direction.
  const open = page.getByRole('button', { name: 'Audio and subtitles for Arrival' });
  await reachByArrowKeys(page, open);
  await open.press('Enter');

  const picker = page.getByRole('dialog', { name: 'Audio and subtitles' });
  await expect(picker).toBeVisible();
  // Focus came in with the menu: until it does, the arrow keys are walking the
  // controls *behind* it, for the reason `track-picker.tsx` sets out.
  await expect(picker.locator(':focus')).toBeVisible();

  /*
   * The arrow keys cannot leave this menu either, in any direction — the same
   * check as the one above for the player, and it is here because the menu is
   * the *second* overlay on the screen rather than the first.
   *
   * This is what the player's own escape hatch looked like from inside the
   * menu: the title page is a pop-up at this width and so is itself
   * `position: fixed`, and the flow rule used to read the **outermost** fixed
   * ancestor of a thing. That answered the title page for the menu's buttons
   * and for the cards on the page behind it alike, so Right from Off had a
   * card among its candidates — nearer than the choice beside it, once CI's
   * boxes came out a hair wider than this machine's. Only the rule is pinned
   * here, not the geometry that exposed it, because the geometry is exactly
   * the part that differs between one machine and the next.
   */
  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown']) {
    await page.keyboard.press(key);
    await expect(picker.locator(':focus'), `${key} left the menu`).toBeVisible();
  }

  // Every track is reachable by direction alone, which is the whole criterion.
  const spanish = picker
    .getByRole('group', { name: 'Subtitles' })
    .getByRole('button', { name: 'Spanish' });
  await reachByArrowKeys(page, spanish);
  await spanish.press('Enter');

  // Choosing closes the menu and leaves the player where it was.
  await expect(picker).toBeHidden();
  await page.getByRole('button', { name: 'Play Arrival' }).press('Enter');

  // The Spanish file the Server converted, parsed here and drawn by the app.
  // Its first cue runs from half a second to three seconds.
  const cue = page.locator('.player__subtitles');
  await expect(cue).toContainText('Hola', { timeout: 10_000 });

  // Really over the picture: inside the element that goes full-screen, and
  // sitting within the video's own box rather than beside it.
  const cueBox = await cue.boundingBox();
  const videoBox = await page.locator('video').boundingBox();
  expect(cueBox).not.toBeNull();
  expect(videoBox).not.toBeNull();
  expect(cueBox?.y ?? 0).toBeGreaterThanOrEqual(videoBox?.y ?? 0);
  expect((cueBox?.y ?? 0) + (cueBox?.height ?? 0)).toBeLessThanOrEqual(
    (videoBox?.y ?? 0) + (videoBox?.height ?? 0) + 1,
  );
  // And it is never something a User can press, or that swallows a press.
  expect(await cue.evaluate((node) => getComputedStyle(node).pointerEvents)).toBe('none');

  // The second cue replaces the first, which is the engine's timing in a real
  // browser rather than against a `currentTime` a test set by hand.
  await expect(cue).toContainText('Adiós', { timeout: 10_000 });
});

/**
 * Walks focus to one control with the arrow keys alone, and fails if it cannot
 * be reached that way.
 *
 * A **search** rather than a fixed sequence of presses, because what the ticket
 * asks for is that every choice is *reachable* by direction. Asserting one
 * exact route would be asserting this stylesheet's column count instead, and
 * that differs between the projects this suite runs in: the track picker is
 * three columns wide on the desktop viewport and two on the phone one.
 *
 * The route it takes is the one a User takes: **it presses towards the thing it
 * wants**. Down when the target is on a line below, along when it is on this
 * one, and the other axis when the first press finds nothing that way. That is
 * what "reachable by direction" means to a person holding a remote, and it is
 * the only route that does not quietly assume a shape for the menu.
 *
 * It replaces a row-by-row sweep — along until focus stops moving, then down
 * and back the other way — which read as if it reached every cell of a grid and
 * did not. A sweep only covers a row if it *enters* that row at one end, and
 * `Down` lands wherever the geometry says, which is often the middle; the sweep
 * then turned and walked away from the half it had not seen. It also assumed
 * `Right` stays on its row, and in the one-column layout the menu falls into on
 * a narrow screen `Right` from a track jumps to the Done button centred below
 * it, because that really is the only thing to the right. Both holes depend on
 * how many columns the menu has, which depends on how wide its buttons are,
 * which depends on the **fonts the machine has** — so this passed on every
 * developer's macOS and never once on CI's Linux, where the choices are a
 * hair's width wider. Measured across fourteen viewport widths, the sweep could
 * not reach Spanish at 340, 360 or 375 and this reaches it at all fourteen.
 *
 * **Left and Right are not pressed while the seek bar has focus.** There they
 * are a ten-second seek rather than a move of focus — #26's rule, and the
 * player takes those keys before the navigator sees them — so pressing one
 * would scrub the Title instead of moving along. An even earlier version of
 * this did exactly that and quietly ran the film to its end.
 */
async function reachByArrowKeys(page: Page, target: ReturnType<Page['getByRole']>): Promise<void> {
  for (let press = 0; press < 40; press += 1) {
    if (await target.evaluate((node) => node === document.activeElement)) return;

    if (await page.evaluate(() => document.activeElement?.hasAttribute('data-player-seek') === true)) {
      await pressAndSettle(page, 'ArrowDown');
      continue;
    }

    let moved = false;
    for (const key of await keysTowards(page, target)) {
      if (await pressAndSettle(page, key)) {
        moved = true;
        break;
      }
    }
    // Nothing in any direction: pressing on cannot help, and the assertion
    // below is the one that should say so.
    if (!moved) break;
  }

  await expect(target).toBeFocused();
}

/**
 * Presses a key and answers whether focus really moved.
 *
 * It **waits** for the answer rather than taking one reading straight after the
 * press. The navigator moves focus synchronously inside its own `keydown`
 * handler today (`src/navigation/spatial-navigation.ts` calls `focus()` there),
 * so one reading is right — but a single sample is only right for as long as
 * that stays true, and a screen that moved focus from an effect instead would
 * turn this helper's every press into "that moved nothing" on slow hardware and
 * nowhere else. Waiting for it to settle costs nothing when it already has.
 *
 * Focus is compared **by identity**, not by position in the document: the old
 * reading was an index into a live `querySelectorAll` over the whole page, and
 * the title page behind the player is still filling its Rows in while this
 * runs, so an element arriving ahead of the focused one shifted that index and
 * read as a move that never happened. Identity cannot be fooled that way, and
 * it still tells apart two buttons that are identical in every other respect —
 * the sound and the subtitles both offer one named "English".
 */
async function pressAndSettle(page: Page, key: string): Promise<boolean> {
  const before = await focusToken(page);
  await page.keyboard.press(key);
  for (let wait = 0; wait < 10; wait += 1) {
    if ((await focusToken(page)) !== before) return true;
    await page.waitForTimeout(25);
  }
  return false;
}

/** What focus is on, as a token that is stable for as long as that element is. */
function focusToken(page: Page): Promise<string> {
  return page.evaluate(() => {
    const scope = window as unknown as { __focusIds?: WeakMap<Element, string>; __focusN?: number };
    if (scope.__focusIds === undefined) {
      scope.__focusIds = new WeakMap();
      scope.__focusN = 0;
    }
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || active === document.body) return 'nothing';
    let token = scope.__focusIds.get(active);
    if (token === undefined) {
      scope.__focusN = (scope.__focusN ?? 0) + 1;
      token = `focus-${String(scope.__focusN)}`;
      scope.__focusIds.set(active, token);
    }
    return token;
  });
}

/**
 * The arrow keys that go towards the target, the most useful first.
 *
 * Whether the target shares a line with what focus is on is read off the boxes
 * rather than assumed: two things on one line is exactly what the navigator's
 * own geometry means by a row, and it is the fact that decides whether the
 * useful press is along the line or across it. The two keys that lead away come
 * last, so a corner the first two cannot leave still has somewhere to go.
 */
async function keysTowards(page: Page, target: ReturnType<Page['getByRole']>): Promise<string[]> {
  const here = await page.evaluate(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement)) return null;
    const box = active.getBoundingClientRect();
    return { y: box.top, height: box.height, middleX: box.left + box.width / 2, middleY: box.top + box.height / 2 };
  });
  const there = await target.boundingBox();
  if (here === null || there === null) return ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp'];

  const onOneLine = there.y < here.y + here.height && here.y < there.y + there.height;
  const across = there.y + there.height / 2 > here.middleY ? 'ArrowDown' : 'ArrowUp';
  const along = there.x + there.width / 2 > here.middleX ? 'ArrowRight' : 'ArrowLeft';
  const backAcross = across === 'ArrowDown' ? 'ArrowUp' : 'ArrowDown';
  const backAlong = along === 'ArrowRight' ? 'ArrowLeft' : 'ArrowRight';

  return onOneLine ? [along, across, backAlong, backAcross] : [across, along, backAcross, backAlong];
}
