import type { APIRequestContext, Page } from '@playwright/test';
import { reachByArrowKeys } from './arrow-keys';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Image subtitles in a real browser (#30, story 105).
 *
 * This file exists because of what #29 cost. That ticket was paused looking
 * finished — five commits, every unit test green — and libass had **never
 * started in a browser at all**: the unit journey fakes the device layer, and
 * nothing runs a decoder or a worker in happy-dom. An e2e found it; no unit
 * test could have. So the rule this suite now works to is that a decoding path
 * which depends on something a real browser does has to be proved here.
 *
 * Four things earn the browser, and the unit journey
 * (`test/unit/image-subtitles.test.tsx`) covers everything else:
 *
 * - **That the decoder is really lazy**, which is the ticket's second
 *   acceptance criterion and is a claim about what is *not* downloaded. Only a
 *   browser that has played a Title with plain subtitles and fetched no libpgs
 *   can say it.
 * - **That libpgs really loads and really decodes.**
 *   `image-subtitle-renderer.ts` is, like its styled sibling, a module with no
 *   unit coverage by construction. The specific thing waiting to go wrong here
 *   is `workerUrl`: libpgs defaults it to a bare relative string that resolves
 *   against the document, so the app would ask for `/libpgs.worker.js`, get
 *   `index.html` back from the SPA, and watch a worker parse HTML as
 *   JavaScript and never reply — `ready` unsettled, no error, a blank canvas.
 *   That is #29's trap in a different library, and this is the only place it
 *   shows.
 * - **That the stream is really fetched by the worker**, read off the
 *   **Server's** record rather than the page's, because a worker's requests
 *   are not the page's.
 * - **Geometry**, which happy-dom cannot answer: every element there has a
 *   zero-sized box.
 *
 * It asserts on requests, attributes and boxes, **never on pixels**, which is
 * the line `styled-subtitles.spec.ts` drew. Two things stand in for looking at
 * what was painted: the `.sup` appearing in the *Server's* request log, which
 * only a live worker running libpgs ever asks for, and `data-renderer="live"`
 * on the canvas, which the component sets once `ready` has resolved. Reading
 * the canvas's own `width` would have been neater and does not work — libpgs
 * transfers the canvas into its worker where `OffscreenCanvas` exists, so from
 * the page it stays 300×150 however much is drawn on it.
 *
 * Arrival is the Title: a PGS track at stream 6 and a VobSub one at stream 7,
 * which take opposite paths on the same device. It is the Title the browser
 * suite plays because it direct-plays — Heat, which has carried a PGS track
 * since #27, is 4K HEVC in Matroska and so is always a transcode the fake has
 * no transcoder for.
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
 * Arrival, playing and then paused **inside its first display set**, with the
 * subtitle menu open.
 *
 * The pause is for the reason #27's, #28's and #29's browser tests pause: the
 * committed test video runs for six seconds, and a Title left running would
 * end — and close the player — in the middle of walking a menu with arrow
 * keys. Where it is paused matters more here than it does there, though: the
 * fake's PGS stream puts its first display set at 0.5 s and clears at 6 s, so
 * pausing inside that window is what gives the decoder something to draw.
 */
async function openTheSubtitleMenu(page: Page): Promise<void> {
  await page
    .getByRole('list', { name: 'New on Jellyflick' })
    .getByRole('listitem', { name: 'Arrival' })
    .press('Enter');
  // The **URL**, not the `h1`: the Billboard draws a Title's name in an `h1`
  // too, so a test waiting for that heading can be looking at Home and never
  // know (#21). The address is the one thing only the title page has.
  await expect(page).toHaveURL(/\/title\/movie-arrival$/);

  await page.getByRole('button', { name: 'Play', exact: true }).press('Enter');
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Seek through Arrival' })).toBeVisible();
  // Really playing before it is paused: the button reads "Pause" from the
  // moment the controls appear, so pressing it earlier would *start* the Title.
  await expect.poll(() => positionIn(page), { timeout: 10_000 }).toBeGreaterThan(0.8);
  await page.getByRole('button', { name: 'Pause Arrival' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Play Arrival' })).toBeVisible();

  const open = page.getByRole('button', { name: 'Audio and subtitles for Arrival' });
  await reachByArrowKeys(page, open);
  await open.press('Enter');
  await expect(page.getByRole('dialog', { name: 'Audio and subtitles' })).toBeVisible();
}

async function chooseSubtitles(page: Page, name: string): Promise<void> {
  const picker = page.getByRole('dialog', { name: 'Audio and subtitles' });
  await expect(picker).toBeVisible();
  const track = picker.getByRole('group', { name: 'Subtitles' }).getByRole('button', { name });
  await reachByArrowKeys(page, track);
  await track.press('Enter');
}

/** The canvas's own attributes, which libpgs sizes from the stream itself. */
function canvasSize(page: Page): Promise<{ width: number; height: number }> {
  return page.evaluate(() => {
    const canvas = document.querySelector('.player__image-subtitles');
    return canvas instanceof HTMLCanvasElement
      ? { width: canvas.width, height: canvas.height }
      : { width: -1, height: -1 };
  });
}

test.afterEach(async ({ request }: { request: APIRequestContext }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);
});

/**
 * The ticket's second acceptance criterion, both halves, in the order a User
 * meets them: a plain track costs nothing, and the decoder arrives when — and
 * only when — a bitmap is asked for.
 */
test('fetches the decoder only once a PGS track is chosen, and decodes the stream', async ({
  page,
}) => {
  // Reseeded here rather than only in `afterEach`: a stop report from the test
  // before this one can land after that hook has run, and the resume point it
  // leaves would start Arrival near the end of its six seconds.
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);

  const fetched: string[] = [];
  page.on('request', (request) => fetched.push(request.url()));
  const decoder = (): string[] => fetched.filter((url) => url.includes('libpgs'));
  const wasm = (): string[] => fetched.filter((url) => url.endsWith('.wasm'));

  await signIn(page);
  await openTheSubtitleMenu(page);

  /*
   * The whole player is now loaded, playing and paused with its menu open,
   * and none of what it fetched is the decoder. This is the state every User
   * who never reaches for a bitmap track stays in, and it is exactly what the
   * acceptance criterion is about: Arrival's plain English and Spanish tracks
   * and its styled Japanese one are all still there to be chosen, and none of
   * them costs a byte of libpgs.
   */
  await expect(page.locator('.player__image-subtitles')).toHaveCount(0);
  expect(decoder()).toEqual([]);

  await chooseSubtitles(page, 'Portuguese (PGS)');

  // The canvas appears from the decision, before anything is downloaded.
  await expect(page.locator('.player__image-subtitles')).toBeVisible();
  // The worker script is what says the decoder was really asked for and came.
  await expect.poll(decoder, { timeout: 30_000 }).not.toEqual([]);

  /*
   * **And a display set was really drawn**, which is the assertion the
   * `workerUrl` trap fails and the strongest one available without comparing
   * pixels.
   *
   * The canvas starts at a browser's default 300×150, and libpgs resizes it
   * to the frame size carried in the stream's own presentation composition
   * the first time it draws — so 1920×1080 means bytes fetched, parsed into
   * display sets, and rendered. It holds even on a browser that transfers the
   * canvas into the worker: the placeholder element reports the size its
   * `OffscreenCanvas` was given, which is worth knowing because the opposite
   * was assumed here first and was wrong.
   */
  await expect
    .poll(async () => (await canvasSize(page)).width, { timeout: 30_000 })
    .toBe(1920);
  expect((await canvasSize(page)).height).toBe(1080);

  // And it did not fail on the way: a stream libpgs refused would have
  // rejected `ready` and put the notice beside the picture instead.
  await expect(page.getByText('Jellyflick could not read those subtitles')).toHaveCount(0);

  /*
   * No WebAssembly, which is the difference from #29 worth pinning down.
   * libpgs is plain JavaScript, and that is why it runs on the Chromium 68
   * floor where JASSUB cannot — if a future version started shipping a binary,
   * this is where the floor would notice.
   */
  expect(wasm()).toEqual([]);

  // And the text overlay is not also drawing underneath: the player renders
  // one of the three, so the overlay is gone rather than empty.
  await expect(page.locator('.player__subtitles')).toHaveCount(0);
});

/**
 * That the **worker** fetched the stream, read off the Server's own record.
 * The app hands over a URL rather than bytes so the fetch happens where the
 * decoding does, and a worker's requests never appear on the page — so the
 * fake is the only witness, and the right one to ask.
 */
test('the decoder fetches the raw .sup itself, from inside its worker', async ({ page }) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);

  const supRequests = async (): Promise<string[]> => {
    const response = await page.request.get(`${FAKE_JELLYFIN_URL}/__fake/requests`);
    const recorded = (await response.json()) as { path?: string }[];
    return recorded
      .map((request) => request.path ?? '')
      .filter((path) => path.includes('/Subtitles/') && path.includes('Stream.sup'));
  };

  await signIn(page);
  await openTheSubtitleMenu(page);
  await chooseSubtitles(page, 'Portuguese (PGS)');
  await expect(page.locator('.player__image-subtitles')).toBeVisible();

  /*
   * `Stream.sup` and the stream's own index. The extension is the honest one
   * rather than a conversion: §14's graphical passthrough refuses to parse or
   * rewrite a bitmap and hands the raw file over whatever was asked for, so
   * `sup` is the only spelling whose content type matches what arrives.
   */
  await expect.poll(supRequests, { timeout: 30_000 }).not.toEqual([]);
  expect((await supRequests()).join(' ')).toContain('/Subtitles/6/');
});

/**
 * Where the canvas sits, which is geometry and therefore browser-only. A PGS
 * display set carries absolute coordinates inside the video's frame, so like
 * an ASS file it fills the picture rather than sitting at the bottom of it —
 * and the rule it must still keep is #27's, that a subtitle never lands on the
 * controls.
 */
test('draws over the picture and never over the controls', async ({ page }) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await signIn(page);
  await openTheSubtitleMenu(page);
  await chooseSubtitles(page, 'Portuguese (PGS)');

  const canvas = page.locator('.player__image-subtitles');
  await expect(canvas).toBeVisible();
  const box = await canvas.boundingBox();
  const video = await page.locator('video').boundingBox();
  const bar = await page.getByRole('slider', { name: 'Seek through Arrival' }).boundingBox();
  expect(box).not.toBeNull();
  expect(video).not.toBeNull();
  expect(bar).not.toBeNull();
  if (box === null || video === null || bar === null) return;

  // The picture's own cell, to within a pixel of rounding.
  expect(Math.abs(box.y - video.y)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height - video.height)).toBeLessThanOrEqual(1);
  // And the controls are below it, untouched.
  expect(box.y + box.height).toBeLessThanOrEqual(bar.y + 1);
});

/**
 * A track the Server burns in, which is the other half of the ticket, and the
 * one assertion that scrolling cannot paper over: a canvas sized from a
 * 1920-pixel stream has every opportunity to push a phone's layout sideways.
 */
test('burns a VobSub track in, disables the timing panel, and stays inside a phone', async ({
  page,
}) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await page.setViewportSize({ width: 375, height: 812 });

  await signIn(page);
  await openTheSubtitleMenu(page);
  await chooseSubtitles(page, 'German (VobSub)');

  /*
   * Choosing it asks the Server again, so the controls go while there is no
   * plan and come back with one — which is why the menu is reopened by
   * waiting for the button rather than by assuming it is still there.
   */
  const open = page.getByRole('button', { name: 'Audio and subtitles for Arrival' });
  await expect(open).toBeVisible({ timeout: 30_000 });
  await open.press('Enter');

  const picker = page.getByRole('dialog', { name: 'Audio and subtitles' });
  await expect(picker).toBeVisible();

  // Nothing is decoded here: VobSub has no client-side renderer on any device.
  await expect(page.locator('.player__image-subtitles')).toHaveCount(0);

  // The ticket's fourth box, in a real browser: offered, unpressable, and the
  // reason said in words beside it.
  const timing = picker.getByRole('button', { name: 'Subtitle timing' });
  await expect(timing).toHaveAttribute('aria-disabled', 'true');
  await expect(
    picker.getByText('The Server is drawing these subtitles into the picture', { exact: false }),
  ).toBeVisible();

  // It is still a focus stop a remote can reach, which is the whole reason it
  // is `aria-disabled` rather than `disabled`.
  await reachByArrowKeys(page, timing);
  await timing.press('Enter');
  await expect(picker).toBeVisible();

  /*
   * **The document never scrolls sideways at 375px.** The one assertion a
   * canvas sized to a 1920-pixel stream could break, and the one that cannot
   * be papered over by scrolling to the element first.
   */
  const widths = await page.evaluate(() => ({
    scroll: document.documentElement.scrollWidth,
    client: document.documentElement.clientWidth,
  }));
  expect(widths.scroll).toBeLessThanOrEqual(widths.client);
});
