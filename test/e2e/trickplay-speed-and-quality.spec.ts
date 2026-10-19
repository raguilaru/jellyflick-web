import type { APIRequestContext, Page } from '@playwright/test';
import { reachByArrowKeys } from './arrow-keys';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Trickplay, speed, picture-in-picture and quality in a real browser (#32,
 * stories 90–93).
 *
 * The unit journey (`test/unit/scrubbing-speed-and-quality.test.tsx`) covers
 * the decisions — which thumbnail a moment is, what goes into `PlaybackInfo`,
 * what is remembered where. It cannot cover any of this, and #29 is the
 * standing reason to say so out loud: that ticket shipped a renderer that had
 * **never started in a browser** while every unit test passed, because the
 * unit journey fakes the device layer. #30 found the same trap in a second
 * library. Two of this ticket's four features are browser behaviour in exactly
 * that sense:
 *
 * - **Picture-in-picture is a request to the browser.** happy-dom has no
 *   `requestPictureInPicture` at all, so the unit journey stubs one and
 *   asserts that it was *called*. Whether a window really opens — whether
 *   `document.pictureInPictureElement` ever becomes this `<video>` — has no
 *   answer outside a browser, and neither has leaving it again.
 * - **A trickplay preview is a tile image, fetched and cropped by CSS.** The
 *   unit journey reads the inline `style` string the component wrote. It
 *   cannot say that the URL in it resolves to anything, that the Server
 *   answered with image bytes rather than a 404, or that the box lands
 *   anywhere sensible — and `previewLeft` is **entirely unexercised** by it,
 *   because happy-dom gives every box a zero size and the clamp takes its
 *   zero branch for all of them.
 *
 * Which is also why the fake serves a **real PNG** here rather than a shape:
 * `test/fake-jellyfin/routes/trickplay.ts` writes a sheet of flat-coloured
 * cells, one hue per thumbnail, with a darker band down each cell's left edge.
 * So a sheet drawn at the wrong offset is a different colour, and the
 * screenshot tour shows it.
 *
 * The two that are not browser behaviour still earn a place here for the seam
 * they cross. A **speed** is `playbackRate`, and the thing that can go wrong
 * with it is a *real* element reattaching a source and resetting it — which
 * happens on a re-negotiation and nowhere in happy-dom. A **quality** choice
 * is that re-negotiation: the Server produces a different transcode, the
 * controls are torn down and rebuilt, and the two features meet.
 *
 * It asserts on requests, attributes, computed styles and boxes, **never on
 * pixels**, which is the line `styled-subtitles.spec.ts` drew and
 * `image-subtitles.spec.ts` kept.
 *
 * Arrival is the Title throughout: it direct-plays in plain Chromium (VP9 in
 * WebM) and it is the one Title the fake has generated thumbnails for, at two
 * widths — 160 and 320 — so "the smallest that is still sharp enough" is a
 * choice a browser can be watched making.
 */

const PASSWORD = 'correct horse';

/**
 * What the preview is drawn from, once the arithmetic has run.
 *
 * `PREVIEW_MAX_WIDTH` is 240 and the Server has 160 and 320, so the choice is
 * **320** — the smallest that is still at least as wide as the box — scaled by
 * 240/320. Every number below follows from that and from the manifest in
 * `test/fake-jellyfin/data.ts`: 320×180 thumbnails, three across and two down,
 * six of them, one a second.
 *
 * They are written out rather than computed, so that a change at either end is
 * a failure here rather than two files agreeing with each other about nothing.
 */
const CHOSEN_WIDTH = 320;
const THUMBNAIL = { width: 240, height: 135 };
const SHEET = { width: 720, height: 270 };

type Write = { method: string; path: string; body: Record<string, unknown> };

async function signIn(page: Page): Promise<void> {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();
}

/** Where the `<video>` has got to, which is the proof it really decoded. */
function positionIn(page: Page): Promise<number> {
  return page.evaluate(() => {
    const video = document.querySelector('video');
    return video === null ? -1 : video.currentTime;
  });
}

/**
 * Arrival, playing and then **paused**, with the controls up.
 *
 * Paused for the reason every browser test of the player pauses: the committed
 * video runs for six seconds, and a Title left running would end — and close
 * the player — part-way through walking a menu with the arrow keys.
 */
async function playAndPauseArrival(page: Page): Promise<void> {
  await page
    .getByRole('list', { name: 'New on Jellyflick' })
    .getByRole('listitem', { name: 'Arrival' })
    .press('Enter');
  /*
   * The **URL**, not the `h1`. The Billboard draws the featured Title's name
   * in an `h1` too, so a test that waits for that heading can be looking at
   * Home and never know — three tickets in a row were caught by it.
   */
  await expect(page).toHaveURL(/\/title\/movie-arrival$/);

  await page.getByRole('button', { name: 'Play', exact: true }).press('Enter');
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Seek through Arrival' })).toBeVisible();
  // Really playing before it is paused: the button reads "Pause" from the
  // moment the controls appear, so pressing it earlier would *start* the Title.
  await expect.poll(() => positionIn(page), { timeout: 20_000 }).toBeGreaterThan(0.8);
  await page.getByRole('button', { name: 'Pause Arrival' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Play Arrival' })).toBeVisible();
}

/**
 * Opens the playback options, reaching the control **by direction alone** —
 * which is #40's rule for a new focusable thing over the picture, and the
 * reason `test/e2e/arrow-keys.ts` is shared rather than copied.
 *
 * **Visible is not settled**, so the press is retried. A quality choice
 * re-negotiates, which tears the controls down and builds them again, and a
 * press that lands on the button on its way out opens a dialog the rebuild
 * discards. Pressing again is what a User does when nothing happened, and the
 * guard keeps it idempotent: a press only ever goes to a closed menu, so a
 * slow open is never toggled back shut. This is #30's flake, in the one place
 * this ticket was told to expect it.
 */
async function openPlaybackOptions(page: Page): Promise<void> {
  const open = page.getByRole('button', { name: 'Playback options for Arrival' });
  const menu = page.getByRole('dialog', { name: 'Playback options' });
  await expect(open).toBeVisible({ timeout: 30_000 });

  await expect(async () => {
    if (!(await menu.isVisible())) {
      await reachByArrowKeys(page, open);
      await open.press('Enter');
    }
    await expect(menu).toBeVisible({ timeout: 2_000 });
  }).toPass({ timeout: 30_000 });
}

/** Presses one choice inside the menu, by direction, as a remote would. */
async function chooseInOptions(page: Page, group: string, name: string): Promise<void> {
  const menu = page.getByRole('dialog', { name: 'Playback options' });
  const choice = menu.getByRole('group', { name: group }).getByRole('button', { name, exact: true });
  await expect(choice).toBeVisible();
  await reachByArrowKeys(page, choice);
  await choice.press('Enter');
}

type PreviewReading = {
  found: boolean;
  width: number;
  height: number;
  left: number;
  right: number;
  size: string;
  position: string;
  image: string;
};

/** The preview's own box, and the three numbers CSS is cropping the sheet with. */
function previewStyle(page: Page): Promise<PreviewReading> {
  return page.evaluate(() => {
    const preview = document.querySelector('.player__preview');
    if (!(preview instanceof HTMLElement)) {
      return {
        found: false,
        width: -1,
        height: -1,
        left: -1,
        right: -1,
        size: '',
        position: '',
        image: '',
      };
    }
    const box = preview.getBoundingClientRect();
    const computed = getComputedStyle(preview);
    return {
      found: true,
      width: box.width,
      height: box.height,
      left: box.left,
      right: box.right,
      size: computed.backgroundSize,
      position: computed.backgroundPosition,
      image: computed.backgroundImage,
    };
  });
}

/** Every tile image the **Server** was asked for, from its own record. */
async function tileReads(request: APIRequestContext): Promise<string[]> {
  const response = await request.get(`${FAKE_JELLYFIN_URL}/__fake/requests`);
  const recorded = (await response.json()) as { path?: string }[];
  return recorded.map((asked) => asked.path ?? '').filter((path) => path.includes('/Trickplay/'));
}

async function writesTo(request: APIRequestContext, path: string): Promise<Write[]> {
  const writes = (await (await request.get(`${FAKE_JELLYFIN_URL}/__fake/writes`)).json()) as Write[];
  return writes.filter((write) => write.path === path);
}

/**
 * The state is put back **and** both logs forgotten after every test.
 *
 * Closing the player reports the stop, and that report is sent behind the
 * User — so it can land after this hook has run and leave the next test a
 * resume point nobody in it chose, which on a six-second file means starting
 * near the end. That is #52's shape in the browser suite; every test here
 * reseeds on its own way in as well, the way `image-subtitles.spec.ts` does.
 */
test.afterEach(async ({ request }: { request: APIRequestContext }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/requests`);
});

/**
 * Story 90's first acceptance criterion in a browser: a thumbnail that is
 * really there, really fetched, and really cropped to one frame of a sheet.
 *
 * Focus rather than hover, so it runs in all three projects — and because it
 * is the half a remote gets. A remote cannot hover, so focus on the bar shows
 * the thumbnail for where the playhead *is*, which is `player-controls.tsx`'s
 * second trigger.
 */
test('fetches a real tile image and crops it to one frame of the sheet', async ({
  page,
  request,
}) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/requests`);

  await signIn(page);
  await playAndPauseArrival(page);

  // Nothing is drawn until a User asks for one: the preview is a scrubbing
  // aid, not a decoration over the bar.
  await expect(page.locator('.player__preview')).toHaveCount(0);

  const bar = page.getByRole('slider', { name: 'Seek through Arrival' });
  await reachByArrowKeys(page, bar);
  await expect(page.locator('.player__preview')).toBeVisible();

  const drawn = await previewStyle(page);
  expect(drawn.found).toBe(true);

  /*
   * **The box is the thumbnail's own size**, which is the first thing
   * happy-dom cannot answer: there every box is zero and this assertion is
   * vacuous. 320 is the width chosen out of the two the Server has, scaled to
   * the 240 the preview is drawn at, so the box is 240×135 and the sheet
   * behind it is three of those across and two down.
   */
  expect(Math.round(drawn.width)).toBe(THUMBNAIL.width);
  expect(Math.round(drawn.height)).toBe(THUMBNAIL.height);
  expect(drawn.size).toBe(`${String(SHEET.width)}px ${String(SHEET.height)}px`);

  expect(drawn.image).toContain(`/Trickplay/${String(CHOSEN_WIDTH)}/0.jpg`);

  /*
   * **The sheet was really asked for**, read off the **Server's** own record
   * rather than the page's.
   *
   * `page.on('response')` is the obvious witness and it is the wrong one, as
   * this test found by being broken on purpose: point the URL at a width the
   * Server does not have and Chromium requests it, the fake answers 404, and
   * **no `response` event fires at all** — a failed image subresource does not
   * surface as one. So the listener would have reported "no tile image
   * fetched" either way and could never have told a 404 from a 200. The fake
   * saw the request and says so, which is the same reason
   * `image-subtitles.spec.ts` reads its `.sup` off `/__fake/requests`.
   *
   * The **320** the Server has, tile image **0** — six thumbnails in one 3×2
   * sheet, so there is only ever one — carrying the source id and the token in
   * the query, because an element cannot send a header.
   */
  const asked = await tileReads(request);
  expect(asked.length).toBeGreaterThan(0);
  expect(asked[0]).toContain(`/Videos/movie-arrival/Trickplay/${String(CHOSEN_WIDTH)}/0.jpg`);
  expect(asked[0]).toContain('mediaSourceId=source-movie-arrival');
  expect(asked[0]).toContain('ApiKey=');

  /*
   * **And what came back is a real sheet of the size CSS is cropping.** The
   * URL in a `background-image` can 404 in perfect silence — the box is drawn,
   * every box assertion above still passes, and a User sees an empty rectangle
   * over the bar. So the same URL is loaded again through an `Image`, which
   * has a `naturalWidth` to read: 960×360 is the fake's PNG at its own scale,
   * three 320×180 thumbnails across and two down, decoded by this browser.
   */
  const sheet = await page.evaluate(
    (url) =>
      new Promise<{ width: number; height: number }>((resolve) => {
        const image = new Image();
        image.addEventListener('load', () =>
          resolve({ width: image.naturalWidth, height: image.naturalHeight }),
        );
        image.addEventListener('error', () => resolve({ width: -1, height: -1 }));
        image.src = url;
      }),
    drawn.image.replace(/^url\("?|"?\)$/g, ''),
  );
  expect(sheet).toEqual({ width: 960, height: 360 });

  // The 160-wide set is never fetched: choosing the smallest that is still
  // sharp enough is a choice, and fetching both would make it a pretence.
  expect(asked.join(' ')).not.toContain('/Trickplay/160/');

  // It says nothing to a screen reader: the bar already announces where it is
  // in words, and a picture of a frame would be a second announcement of the
  // same number.
  await expect(page.locator('.player__preview')).toHaveAttribute('aria-hidden', 'true');
});

/**
 * That the crop **moves with the pointer**, and moves onto the sheet's second
 * row — which is the half of §13's arithmetic a one-row sheet would hide, and
 * what the fake's 3×2 manifest exists to exercise.
 */
test.describe('with a pointer over the bar', () => {
  test.skip(({ keyboardOnly }) => keyboardOnly, 'hovering along the bar is a pointer’s to do');

  test('follows the pointer, onto the second row of the sheet', async ({ page }) => {
    await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);

    await signIn(page);
    await playAndPauseArrival(page);

    const bar = page.getByRole('slider', { name: 'Seek through Arrival' });
    const box = await bar.boundingBox();
    expect(box).not.toBeNull();
    if (box === null) return;

    /** The crop offsets, with the pointer a fraction of the way along the bar. */
    const offsetsAt = async (fraction: number): Promise<string> => {
      await page.mouse.move(box.x + box.width * fraction, box.y + box.height / 2);
      await expect(page.locator('.player__preview')).toBeVisible();
      // The preview is redrawn from a state change, so the style settles a
      // tick after the move rather than inside it.
      let position = '';
      await expect
        .poll(async () => {
          position = (await previewStyle(page)).position;
          return position;
        })
        .not.toBe('');
      return position;
    };

    /*
     * **The far left is the first frame**, which is cell 0: no offset in
     * either direction. An off-by-one in the index, the column or the row
     * shows here before it shows anywhere else.
     */
    expect(await offsetsAt(0.01)).toBe('0px 0px');

    /*
     * **The far right is on the second row.** Six thumbnails, one a second,
     * three to a row: anything past the half-way mark of a six-second file is
     * thumbnail 3 or later, which is row 1 — so the sheet is pulled up by
     * exactly one thumbnail's height. Reading `TileWidth` as pixels rather
     * than as a count of thumbnails, which is §13's own warning, leaves this
     * at `0px`.
     */
    const late = await offsetsAt(0.99);
    expect(late.endsWith(`-${String(THUMBNAIL.height)}px`)).toBe(true);
    expect(late).not.toBe('0px 0px');

    // Leaving the bar takes it away rather than leaving a stale frame over it.
    await page.mouse.move(box.x + box.width / 2, box.y - 150);
    await expect(page.locator('.player__preview')).toHaveCount(0);
  });
});

/**
 * The one assertion scrolling cannot paper over (#44): at 375px, with a
 * preview up at the very end of the bar, **the document is no wider than the
 * screen**.
 *
 * A 240-pixel box placed at a fraction of a bar's width has every opportunity
 * to hang off the right of a phone, and Playwright scrolls an element into
 * view before touching it — so every other assertion in this file would pass
 * through that happening. `previewLeft`'s clamp is the code under test, and
 * happy-dom cannot reach it at all: a bar with no width there takes the zero
 * branch every time.
 *
 * Driven by the keys, so it runs in all three projects. One press of Right on
 * the bar is a ten-second seek, which on a six-second file lands at the end —
 * a second short of it, because a seek that landed exactly there would report
 * the stop and close the player.
 */
test('keeps a preview at the end of the bar inside a 375px screen', async ({ page }) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await page.setViewportSize({ width: 375, height: 812 });

  await signIn(page);
  await playAndPauseArrival(page);

  const bar = page.getByRole('slider', { name: 'Seek through Arrival' });
  await reachByArrowKeys(page, bar);
  await expect(page.locator('.player__preview')).toBeVisible();

  // To the end, which is where a centred preview would hang off the right.
  await bar.press('ArrowRight');
  await expect.poll(() => positionIn(page), { timeout: 20_000 }).toBeGreaterThan(4);
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();

  const drawn = await previewStyle(page);
  expect(drawn.found).toBe(true);
  // Inside the screen on both sides, which is what the clamp is for.
  expect(drawn.left).toBeGreaterThanOrEqual(-1);
  expect(drawn.right).toBeLessThanOrEqual(376);

  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
});

/**
 * Story 92, and the assertion this file exists for most of all: the browser
 * **really opened a window**.
 *
 * `document.pictureInPictureElement` is the only honest answer to "was the
 * request honoured", and there is no such thing outside a browser — the unit
 * journey stubs `requestPictureInPicture` and can say no more than that it was
 * called. A promise that resolves and a window that opens are two different
 * facts, and #29 shipped on the difference between them.
 */
test('really opens a picture-in-picture window, and really leaves it', async ({ page }) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await signIn(page);
  await playAndPauseArrival(page);

  const inWindow = (): Promise<boolean> =>
    page.evaluate(() => document.pictureInPictureElement === document.querySelector('video'));

  // The device layer says this browser has it, which is why there is a button
  // at all: on Chromium 68 — this app's floor — there would be none.
  expect(
    await page.evaluate(() => document.pictureInPictureEnabled),
    'this browser must support picture-in-picture for the rest of this test to mean anything',
  ).toBe(true);

  await openPlaybackOptions(page);
  const enter = page.getByRole('dialog', { name: 'Playback options' }).getByRole('button', {
    name: 'Picture-in-picture',
    exact: true,
  });
  await reachByArrowKeys(page, enter);
  await enter.press('Enter');

  // The window is open, and the picture is in it.
  await expect.poll(inWindow, { timeout: 20_000 }).toBe(true);
  // A refusal would have said so beside the picture instead.
  await expect(
    page.getByText('This browser would not open a picture-in-picture window.'),
  ).toHaveCount(0);

  /*
   * The press closed the menu, so leaving means opening it again — and the
   * button now says the opposite thing, which is what the element's own
   * `enterpictureinpicture` event keeps honest.
   */
  await openPlaybackOptions(page);
  const leave = page.getByRole('dialog', { name: 'Playback options' }).getByRole('button', {
    name: 'Leave picture-in-picture',
    exact: true,
  });
  await reachByArrowKeys(page, leave);
  await leave.press('Enter');

  await expect.poll(inWindow, { timeout: 20_000 }).toBe(false);
  // And the Title is still there behind it: a window closing is not a stop.
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();
});

/**
 * Stories 91 and 93 where they meet, which is the only place either of them
 * can go wrong in a way a unit test cannot see.
 *
 * A quality choice **re-negotiates**: a new `PlaybackInfo` with a lower
 * ceiling, and a new source attached to the same `<video>`. happy-dom never
 * attaches a source it can decode, so a rate that survived that is a claim
 * only a browser can settle. This presses a speed, changes the quality under
 * it, and asks the element itself.
 *
 * Held against the failure, measured rather than reasoned: take
 * `defaultPlaybackRate` out of `player.tsx` and the last assertion below goes
 * red; take the re-applying effect's `plan` dependency out as well, and the
 * `playbackRate` poll goes red too. Either one alone still carries the rate
 * across in this browser, which is worth knowing — the app writes both
 * deliberately, and this is what says so.
 */
test('keeps a chosen speed across the re-negotiation a lower quality causes', async ({
  page,
  request,
}) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);

  await signIn(page);
  await playAndPauseArrival(page);

  const rates = (): Promise<{ rate: number; fallback: number }> =>
    page.evaluate(() => {
      const video = document.querySelector('video');
      return video === null
        ? { rate: -1, fallback: -1 }
        : { rate: video.playbackRate, fallback: video.defaultPlaybackRate };
    });

  await openPlaybackOptions(page);
  await chooseInOptions(page, 'Speed', '1.5×');

  // The element, not a number held beside it.
  await expect.poll(async () => (await rates()).rate, { timeout: 20_000 }).toBe(1.5);
  expect(await positionIn(page)).toBeGreaterThan(0.5);

  await openPlaybackOptions(page);
  await chooseInOptions(page, 'Quality', '2 Mbps');

  /*
   * The Server was asked again, with the ceiling in the **profile** rather
   * than only in the request: a limit read on the streaming side alone would
   * leave a direct-played file untouched, and a file is data too.
   */
  await expect
    .poll(async () => (await writesTo(request, '/Items/movie-arrival/PlaybackInfo')).length, {
      timeout: 30_000,
    })
    .toBeGreaterThan(1);

  const negotiations = await writesTo(request, '/Items/movie-arrival/PlaybackInfo');
  const latest = negotiations[negotiations.length - 1]?.body ?? {};
  const profile = latest.DeviceProfile as Record<string, unknown>;
  expect(profile.MaxStreamingBitrate).toBe(2_000_000);
  expect(profile.MaxStaticBitrate).toBe(2_000_000);
  expect(latest.MaxStreamingBitrate).toBe(2_000_000);
  // And the User kept their place: the next negotiation starts from where they
  // were, not from the beginning.
  expect(latest.StartTimeTicks as number).toBeGreaterThan(0);

  /*
   * **The speed survived the new source.** This is the assertion a player that
   * set only `playbackRate` would fail: a fresh source resets the element to
   * `defaultPlaybackRate`, so a User who slowed a Title down and then changed
   * the quality would be jolted back to full speed with nothing to explain it.
   */
  await expect(page.getByRole('slider', { name: 'Seek through Arrival' })).toBeVisible({
    timeout: 30_000,
  });
  await expect.poll(async () => (await rates()).rate, { timeout: 20_000 }).toBe(1.5);
  // And the element would go back to 1.5 again by itself: `defaultPlaybackRate`
  // is what a media element plays a *newly attached* source at, so this is the
  // half that does not depend on an effect running in time.
  expect((await rates()).fallback).toBe(1.5);

  // And the picture is still there, so the re-negotiation produced something
  // playable rather than a dead element.
  await expect.poll(() => positionIn(page), { timeout: 20_000 }).toBeGreaterThan(0);
});

/**
 * The other half of story 93: the ceiling is remembered on the **device** and
 * is in force the next time, before a User has chosen anything.
 *
 * A browser's own storage rather than a fake's, which is the seam worth
 * crossing here — the unit journey writes through a `DeviceStorage` it
 * supplied, and this writes through the real one and reads it back by
 * reloading the app and playing the Title again.
 */
test('remembers the ceiling on the device and applies it to the next playback', async ({
  page,
  request,
}) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);

  await signIn(page);
  await playAndPauseArrival(page);
  await openPlaybackOptions(page);
  await chooseInOptions(page, 'Quality', '720 kbps');

  await expect
    .poll(async () => (await writesTo(request, '/Items/movie-arrival/PlaybackInfo')).length, {
      timeout: 30_000,
    })
    .toBeGreaterThan(1);

  // Closed, and the whole app reloaded, so nothing but device storage can be
  // carrying the choice across.
  await page.getByRole('button', { name: 'Close' }).press('Enter');
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeHidden();
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);
  await page.reload();

  await page.getByRole('button', { name: 'Play', exact: true }).press('Enter');
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();

  await expect
    .poll(async () => (await writesTo(request, '/Items/movie-arrival/PlaybackInfo')).length, {
      timeout: 30_000,
    })
    .toBeGreaterThan(0);
  const first = (await writesTo(request, '/Items/movie-arrival/PlaybackInfo'))[0]?.body ?? {};
  expect((first.DeviceProfile as Record<string, unknown>).MaxStreamingBitrate).toBe(720_000);

  // And the menu says so, without the User having to remember: 720 kbps is the
  // choice that is pressed, and Auto is not.
  await openPlaybackOptions(page);
  const quality = page
    .getByRole('dialog', { name: 'Playback options' })
    .getByRole('group', { name: 'Quality' });
  await expect(quality.getByRole('button', { name: '720 kbps', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(quality.getByRole('button', { name: 'Auto', exact: true })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
});
