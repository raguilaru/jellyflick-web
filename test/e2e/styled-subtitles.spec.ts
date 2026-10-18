import type { APIRequestContext, Page } from '@playwright/test';
import { reachByArrowKeys } from './arrow-keys';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Styled subtitles in a real browser (#29, story 104).
 *
 * Three things earn the browser here; the unit journey
 * (`test/unit/styled-subtitles.test.tsx`) covers everything else by faking the
 * device layer — which is right, because no test runs a two-megabyte WASM
 * binary in happy-dom:
 *
 * - **That the engine is really lazy.** The first acceptance criterion is
 *   about what is *not* downloaded, and a bundle listing cannot say it: only a
 *   browser that has loaded the app, played a Title with plain subtitles and
 *   fetched no WebAssembly can. The fake device layer never loads anything, so
 *   this is the one place the `import()` is exercised at all.
 * - **That libass really loads here.** `styled-subtitle-renderer.ts` is the
 *   one module in `src/` with no unit coverage by construction. A mistyped
 *   JASSUB option, or a `?url` asset the bundler stopped emitting, would be
 *   invisible everywhere else and would reach a User as subtitles that never
 *   appear.
 * - **That the embedded fonts are really fetched** — by the worker, from the
 *   Attachments URLs the app handed it, which is the whole of "embedded fonts
 *   handled" and is a fact about a running worker rather than about a props
 *   object.
 *
 * It asserts on requests and on the canvas's box, never on pixels. What libass
 * paints is libass's business, and a screenshot comparison of rasterised
 * glyphs would be the flakiest assertion in this suite.
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
 * Arrival, playing and then paused inside its first cue, with the subtitle
 * menu open. Paused for the same reason #27's and #28's browser tests pause:
 * the test video is six seconds long, and a Title left running would end — and
 * close the player — in the middle of walking a menu with arrow keys.
 */
async function openTheSubtitleMenu(page: Page): Promise<void> {
  await page
    .getByRole('list', { name: 'New on Jellyflick' })
    .getByRole('listitem', { name: 'Arrival' })
    .press('Enter');
  /*
   * The **URL**, not the `h1`. The Billboard draws the featured Title's name
   * in an `h1` too, and the sample Server features Arrival — so a test that
   * waits for that heading is already looking at it on Home and can assert
   * happily against a screen that never changed. #21 found two tests doing
   * exactly that. The address is the one thing only the title page has.
   */
  await expect(page).toHaveURL(/\/title\/movie-arrival$/);

  await page.getByRole('button', { name: 'Play', exact: true }).press('Enter');
  await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();
  await expect(page.getByRole('slider', { name: 'Seek through Arrival' })).toBeVisible();
  // Really playing before it is paused: the button reads "Pause" from the
  // moment the controls appear, so pressing it earlier would *start* the Title.
  await expect.poll(() => positionIn(page), { timeout: 10_000 }).toBeGreaterThan(0.4);
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

test.afterEach(async ({ request }: { request: APIRequestContext }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);
});

/**
 * The ticket's first acceptance criterion, both halves of it, in the order a
 * User meets them: plain subtitles cost nothing, and the styled ones fetch the
 * engine when — and only when — they are asked for.
 */
test('fetches the renderer only once a styled track is chosen', async ({ page }) => {
  // Reseeded here rather than only in `afterEach`: a stop report from the test
  // before this one can land after that hook has run, and the resume point it
  // leaves would start Arrival near the end of its six seconds.
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);

  const fetched: string[] = [];
  page.on('request', (request) => fetched.push(request.url()));
  const wasm = (): string[] => fetched.filter((url) => url.endsWith('.wasm'));

  await signIn(page);
  await openTheSubtitleMenu(page);

  // A plain-text track first. Everything about the player is now loaded and
  // drawing, and none of it is libass.
  await chooseSubtitles(page, 'English');
  await expect(page.locator('.player__subtitles')).toContainText('Hello', { timeout: 10_000 });
  expect(wasm()).toEqual([]);
  await expect(page.locator('.player__styled-subtitles')).toHaveCount(0);

  await page.getByRole('button', { name: 'Audio and subtitles for Arrival' }).press('Enter');
  await chooseSubtitles(page, 'Japanese (Styled)');

  // The canvas appears from the decision, before anything is downloaded; the
  // WebAssembly is what says the engine was really asked for and really came.
  await expect(page.locator('.player__styled-subtitles')).toBeVisible();
  await expect.poll(wasm, { timeout: 30_000 }).not.toEqual([]);

  // And the plain-text overlay is not also drawing the same file underneath,
  // which would be every line on the screen twice: the player renders one of
  // the two, so the overlay is gone rather than empty.
  await expect(page.locator('.player__subtitles')).toHaveCount(0);
});

/**
 * "Embedded fonts handled", end to end. The app hands the renderer URLs rather
 * than bytes because the worker fetches them itself, so the only honest place
 * to check that it did is a browser with a worker really running in it.
 */
test('the renderer fetches the embedded fonts the file names', async ({ page }) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);

  /*
   * Read off the **Server's** own record of what was asked of it, not the
   * page's requests: these fetches are made from inside the renderer's
   * worker, and a worker's requests are not the page's. The fake is the only
   * witness that sees them either way, which is the right one to ask.
   */
  const attachments = async (): Promise<string[]> => {
    const response = await page.request.get(`${FAKE_JELLYFIN_URL}/__fake/requests`);
    const recorded = (await response.json()) as { path?: string }[];
    return recorded
      .map((request) => request.path ?? '')
      .filter((path) => path.includes('/Attachments/'));
  };

  await signIn(page);
  await openTheSubtitleMenu(page);
  await chooseSubtitles(page, 'Japanese (Styled)');
  await expect(page.locator('.player__styled-subtitles')).toBeVisible();

  // Both fonts the file names, and nothing else attached to the source: the
  // cover image beside them is not a font and is never handed over as one.
  await expect.poll(attachments, { timeout: 30_000 }).toHaveLength(2);
  const asked = (await attachments()).join(' ');
  expect(asked).toContain('/Attachments/0');
  expect(asked).toContain('/Attachments/1');
  expect(asked).not.toContain('/Attachments/2');
});

/**
 * Where the canvas sits, which is geometry and therefore browser-only: happy-dom
 * gives every element a zero-sized box. An ASS file positions its own lines, so
 * this one fills the picture rather than sitting at the bottom of it — and the
 * rule it must still keep is #27's, that a subtitle never lands on the controls.
 */
test('draws over the picture and never over the controls', async ({ page }) => {
  await page.request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  await signIn(page);
  await openTheSubtitleMenu(page);
  await chooseSubtitles(page, 'Japanese (Styled)');

  const canvas = page.locator('.player__styled-subtitles');
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
