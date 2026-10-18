import type { Page } from '@playwright/test';
import { reachByArrowKeys } from './arrow-keys';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Watch trailer and Download File in a real browser (#19, stories 75–77).
 *
 * Three things live here that no unit test can reach:
 *
 * - **that nothing is fetched from YouTube until the button is pressed.** The
 *   whole of story 75 is about a heavy third-party embed not loading on every
 *   title page, and only a browser counts requests. YouTube itself is
 *   intercepted, so this suite never leaves the machine — what is asserted is
 *   that the request *happens*, and when.
 * - **that the download link really downloads.** The anchor's shape is a unit
 *   test's job; that the browser saves a file from it, with the Server's own
 *   authorisation, is this one's.
 * - **that the page still fits at 375px with a 16:9 embed open.** A video box
 *   is exactly the shape that runs off the side of a phone, and Playwright
 *   scrolls an element into view before touching it, so no other assertion
 *   would see it (#44).
 */

/** The password every sample user on the fake Jellyfin has. */
const PASSWORD = 'correct horse';

/** Every host a YouTube embed could reach, as a route pattern. */
const YOUTUBE = /youtube(-nocookie)?\.com|youtu\.be|ytimg\.com|googlevideo\.com/;

test.afterEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

/**
 * Answers for YouTube so no test ever reaches it, and records what was asked.
 *
 * The list it returns is the assertion: story 75 is a claim about *when* a
 * request is made, so the test needs to see that none has been and then that
 * one has.
 */
async function interceptYouTube(page: Page): Promise<string[]> {
  const asked: string[] = [];
  await page.route(YOUTUBE, async (route) => {
    asked.push(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: '<!doctype html><title>A stand-in for YouTube</title>',
    });
  });
  return asked;
}

async function signIn(page: Page, name = 'Rafael'): Promise<void> {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();
}

/**
 * Opens one Title's page from Home, with Enter: no project has a pointer.
 *
 * **The address is what says the page arrived, not the heading.** Home's
 * Billboard draws the featured Title's name as an `h1` too, and the sample
 * Server features Arrival — so an assertion on the heading can pass against a
 * screen that never changed. #21 and #29 both met that.
 */
async function openFromHome(page: Page, name: string, titleId: string): Promise<void> {
  await page
    .getByRole('list', { name: 'New on Jellyflick' })
    .getByRole('listitem', { name })
    .press('Enter');
  await expect(page).toHaveURL(new RegExp(`/title/${titleId}$`));
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

/** Whether the document is wider than the window, which is the bug to catch. */
function overflowsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

test('plays the Server’s own trailer, and asks YouTube nothing (story 75)', async ({
  page,
}) => {
  const askedYouTube = await interceptYouTube(page);
  await signIn(page);

  // Arrival has a trailer file beside it **and** a YouTube link, which is what
  // makes "the local one is preferred" a thing to see rather than to assume.
  await openFromHome(page, 'Arrival', 'movie-arrival');
  await page.getByRole('button', { name: 'Watch trailer' }).press('Enter');

  await expect(page.getByRole('region', { name: 'Playing Arrival (Trailer)' })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect(askedYouTube).toEqual([]);
});

test('loads the YouTube embed only once it is asked for', async ({ page }) => {
  const askedYouTube = await interceptYouTube(page);
  await signIn(page);

  // Paddington has the YouTube link and no file of its own.
  await openFromHome(page, 'Paddington', 'movie-paddington');

  // Nothing yet, with the button on the screen: this is the assertion the
  // whole story is about.
  await expect(page.getByRole('button', { name: 'Watch trailer' })).toBeVisible();
  expect(askedYouTube).toEqual([]);

  await page.getByRole('button', { name: 'Watch trailer' }).press('Enter');

  const frame = page.locator('iframe');
  await expect(frame).toHaveAttribute(
    'src',
    'https://www.youtube-nocookie.com/embed/8sTR9vgnJ4s',
  );
  await expect.poll(() => askedYouTube.length).toBeGreaterThan(0);

  // And it leaves again when it is closed, rather than going on running
  // behind a `display: none`.
  await page.getByRole('button', { name: 'Close trailer' }).press('Enter');
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('offers no trailer at all for a Title that has none', async ({ page }) => {
  await signIn(page);

  await openFromHome(page, 'Heat', 'movie-heat');

  await expect(page.getByRole('button', { name: 'Watch trailer' })).toHaveCount(0);
});

test('the page still fits a 375px screen with the trailer open', async ({ page }) => {
  await interceptYouTube(page);
  await signIn(page);
  await openFromHome(page, 'Paddington', 'movie-paddington');
  await page.getByRole('button', { name: 'Watch trailer' }).press('Enter');
  await expect(page.locator('iframe')).toHaveCount(1);

  // The project's own width first, then the narrowest the app supports. A 16:9
  // box and a row that has grown two more buttons are both shapes that run off
  // the side of a phone, and nothing that only reads the document would see it.
  expect(await overflowsSideways(page)).toBe(false);

  await page.setViewportSize({ width: 375, height: 700 });
  await expect(page.locator('iframe')).toHaveCount(1);
  expect(await overflowsSideways(page)).toBe(false);
});

test('downloads the original file, with the Server’s own authorisation', async ({
  page,
}) => {
  await signIn(page);
  await openFromHome(page, 'Arrival', 'movie-arrival');

  const link = page.getByRole('link', { name: 'Download File' });
  const href = await link.getAttribute('href');

  expect(href).toContain('/Items/movie-arrival/Download');
  // The token in the query, because an anchor cannot send a header — and the
  // Server really accepts it, which is the half of story 76 that the shape of
  // the URL cannot show. The browser's own request is the one that counts.
  const answer = await page.request.get(href ?? '');
  expect(answer.status()).toBe(200);
  expect(answer.headers()['content-disposition']).toContain('Arrival.webm');
  expect((await answer.body()).byteLength).toBeGreaterThan(0);
});

test('a remote reaches both new controls by direction alone', async ({ page }) => {
  await interceptYouTube(page);
  await signIn(page);
  await openFromHome(page, 'Arrival', 'movie-arrival');

  // Two more things in the actions row is exactly the change that can push
  // something out of a remote's reach, and the row wraps — so the route is
  // searched rather than assumed (#31's helper, and its reasoning).
  await reachByArrowKeys(page, page.getByRole('button', { name: 'Watch trailer' }));
  await reachByArrowKeys(page, page.getByRole('link', { name: 'Download File' }));
});

test('hides Download File from a User the Server does not allow (story 77)', async ({
  page,
}) => {
  // Nico is the sample User whose `Policy.EnableContentDownloading` is false.
  await signIn(page, 'Nico');

  await openFromHome(page, 'Arrival', 'movie-arrival');

  await expect(page.getByRole('link', { name: 'Download File' })).toHaveCount(0);
  // And the Server would refuse it anyway, which is what makes hiding the
  // button a courtesy rather than the security of the thing.
  const refused = await page.request.get(
    `${FAKE_JELLYFIN_URL}/Items/movie-arrival/Download?ApiKey=${await tokenOnDevice(page)}`,
  );
  expect(refused.status()).toBe(403);
});

/** The token the app stored for whoever is signed in on this device. */
async function tokenOnDevice(page: Page): Promise<string> {
  return page.evaluate(() => {
    const stored: unknown = JSON.parse(localStorage.getItem('jellyflick.session') ?? '{}');
    const session = stored as { users?: { userId: string; token: string }[]; activeUserId?: string };
    const active = (session.users ?? []).find((user) => user.userId === session.activeUserId);
    return active?.token ?? '';
  });
}
