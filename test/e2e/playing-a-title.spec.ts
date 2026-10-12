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
  await page.keyboard.press('ArrowRight');

  // Ten seconds into a six-second file lands a second short of the end:
  // seeking to the very end fires `ended`, and a User pressing Right has not
  // asked to leave the player.
  await expect(bar).toHaveAttribute('aria-valuenow', '5');
  await expect(player).toBeVisible();
  await expect(page.getByText('-0:01')).toBeVisible();

  await page.keyboard.press('ArrowLeft');
  await expect(bar).toHaveAttribute('aria-valuenow', '0');

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
