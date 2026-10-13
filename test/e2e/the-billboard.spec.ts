import type { Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/** The password every sample user on the fake Jellyfin has. */
const PASSWORD = 'correct horse';

/**
 * The Billboard at the top of Home, in a real browser against a production
 * build (#16, stories 22 to 33).
 *
 * **The pick is made deterministic through the library, not through the
 * randomness.** In a browser the draw really is `Math.random()` — that is the
 * point of the device layer — so instead each test leaves exactly one Title
 * eligible by marking the others watched. Spotlight prefers what the User has
 * not finished, so the pool is one Title and the draw cannot matter. Which
 * Title a given draw picks out of several is `test/unit/spotlight.test.ts`,
 * where the draw is fixed.
 *
 * Of the three sample Titles with a backdrop: Arrival and Severance have a logo
 * and a local trailer, and Paddington has neither.
 */

test.afterEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

/** Leaves one Title the only unfinished one with a backdrop, so it is featured. */
async function featureOnly(
  request: { post: (url: string, options: { data: unknown }) => Promise<unknown> },
  keep: 'movie-arrival' | 'movie-paddington' | 'series-severance',
): Promise<void> {
  const withBackdrops = ['movie-arrival', 'movie-paddington', 'series-severance'];
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
    data: { played: { 'user-rafael': withBackdrops.filter((id) => id !== keep) } },
  });
}

async function signIn(page: Page): Promise<void> {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
}

/** The Billboard, which names itself as a region rather than by a heading. */
function billboard(page: Page) {
  return page.getByRole('region', { name: 'Featured' });
}

/**
 * Opens the settings screen the way this viewport offers it: a wide screen's
 * top bar carries its own link, and a phone's bottom bar reaches it through the
 * User picture, because its fourth item is who is watching. The same two ways
 * `test/e2e/settings.spec.ts` sets out.
 */
async function openSettings(page: Page): Promise<void> {
  const topBar = page.locator('.top-bar');
  if ((await topBar.count()) > 0) {
    await topBar.getByRole('link', { name: 'Settings' }).press('Enter');
  } else {
    await page.locator('.bottom-bar__user').press('Enter');
    await page.locator('.user-picker').getByRole('link', { name: 'Settings' }).press('Enter');
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
}

/** Back to Home through whichever navigation bar this viewport has. */
async function goHome(page: Page): Promise<void> {
  const bar = (await page.locator('.top-bar').count()) > 0 ? '.top-bar' : '.bottom-bar';
  await page.locator(bar).getByRole('link', { name: 'Home' }).press('Enter');
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
}

test('a User landing on Home is offered one Title, with its backdrop and logo', async ({
  page,
  request,
}) => {
  await featureOnly(request, 'movie-arrival');

  await signIn(page);

  const board = billboard(page);
  await expect(board).toBeVisible();
  // The logo stands in for the heading, and still names the Title.
  await expect(board.locator('.billboard__logo')).toHaveAttribute(
    'src',
    `${FAKE_JELLYFIN_URL}/Items/movie-arrival/Images/Logo?tag=tag-arrival-logo&maxWidth=600`,
  );
  await expect(board.locator('.billboard__logo')).toHaveAttribute('alt', 'Arrival');
  await expect(board.locator('.billboard__backdrop')).toHaveAttribute(
    'src',
    `${FAKE_JELLYFIN_URL}/Items/movie-arrival/Images/Backdrop?tag=tag-arrival-backdrop&maxWidth=1920`,
  );
  await expect(board).toContainText('A linguist is asked to talk to the visitors.');
  await expect(board).toContainText('PG-13');
});

test('the Billboard really fills the top of the window', async ({ page, request }) => {
  await featureOnly(request, 'movie-arrival');

  await signIn(page);

  // What only a browser can say: the backdrop bleeds to both edges, and the
  // Billboard is the first thing on Home rather than something below the Rows.
  const board = billboard(page);
  const box = await board.boundingBox();
  const viewport = page.viewportSize();
  if (box === null || viewport === null) throw new Error('No layout.');

  expect(box.x).toBeLessThanOrEqual(1);
  expect(Math.abs(box.width - viewport.width)).toBeLessThanOrEqual(1);
  expect(box.y).toBeLessThan(viewport.height / 2);
  // Taller than a Row's card, which is what "larger than the Rows" means.
  expect(box.height).toBeGreaterThan(300);
});

test('a Title with no logo is headed by its name in the logo font', async ({ page, request }) => {
  await featureOnly(request, 'movie-paddington');

  await signIn(page);

  const name = billboard(page).locator('.billboard__name');
  await expect(name).toHaveText('Paddington');
  await expect(billboard(page).locator('.billboard__logo')).toHaveCount(0);
  // The wordmark's own face, which is what makes it read as artwork. Asserted
  // through the computed style, because the fallback stack is the thing that
  // would silently be used if the face had not loaded.
  const family = await name.evaluate((element) => getComputedStyle(element).fontFamily);
  expect(family).toContain('Bebas Neue');
});

test('More info opens the featured Title’s own page', async ({ page, request }) => {
  await featureOnly(request, 'movie-arrival');
  await signIn(page);

  await billboard(page).locator('.billboard__more-info').press('Enter');

  await expect(page).toHaveURL(/\/title\/movie-arrival$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Arrival' })).toBeVisible();
});

test('the same Title is still featured on coming back from its title page', async ({
  page,
  request,
}) => {
  // Story 31, and the reason the pick is held above the router. Two Titles are
  // eligible here, so a re-pick really could land on the other one — and with a
  // real `Math.random()` it eventually would.
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
    data: { played: { 'user-rafael': ['movie-paddington'] } },
  });
  await signIn(page);

  const featured = await billboard(page).locator('.billboard__title').innerHTML();
  await billboard(page).locator('.billboard__more-info').press('Enter');
  await expect(page).toHaveURL(/\/title\//);

  await page.goBack();

  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
  await expect(billboard(page).locator('.billboard__title')).toHaveCount(1);
  expect(await billboard(page).locator('.billboard__title').innerHTML()).toBe(featured);
});

test('the local trailer plays by itself, muted, and can be unmuted and paused', async ({
  page,
  request,
}) => {
  await featureOnly(request, 'movie-arrival');

  await signIn(page);

  // It starts after a short delay, so it is waited for rather than expected at
  // once (stories 24 and 25).
  const trailer = billboard(page).locator('.billboard__trailer');
  await expect(trailer).toHaveCount(1);
  await expect(trailer).toHaveJSProperty('muted', true);
  // The trailer's own item, negotiated like any other playback.
  await expect(trailer).toHaveAttribute('src', /trailer-arrival/);
  // Really playing, which only a browser can say.
  await expect
    .poll(async () => await trailer.evaluate((video: HTMLVideoElement) => video.paused))
    .toBe(false);

  await page.getByRole('button', { name: 'Unmute the trailer' }).press('Enter');
  await expect(trailer).toHaveJSProperty('muted', false);

  await page.getByRole('button', { name: 'Pause the trailer' }).press('Enter');
  await expect(trailer).toHaveJSProperty('paused', true);
  await expect(page.getByRole('button', { name: 'Play the trailer' })).toBeVisible();
});

test('a Title with no trailer shows its backdrop and no player at all', async ({
  page,
  request,
}) => {
  // Story 25: Paddington has no local trailer beside it.
  await featureOnly(request, 'movie-paddington');

  await signIn(page);
  await expect(billboard(page).locator('.billboard__backdrop')).toBeVisible();

  // Nothing appears once the delay has passed either.
  await page.waitForTimeout(2000);
  await expect(billboard(page).locator('.billboard__trailer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unmute the trailer' })).toHaveCount(0);
});

test('a User who turns Billboard trailer autoplay off stops getting one', async ({
  page,
  request,
}) => {
  await featureOnly(request, 'movie-arrival');
  await signIn(page);
  // The trailer is there to begin with, so the setting is what changes it.
  await expect(billboard(page).locator('.billboard__trailer')).toHaveCount(1);

  await openSettings(page);
  await page.getByRole('button', { name: 'Just show the backdrop' }).press('Enter');
  await expect(
    page.getByRole('button', { name: 'Just show the backdrop', pressed: true }),
  ).toBeVisible();

  await goHome(page);

  await expect(billboard(page).locator('.billboard__backdrop')).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(billboard(page).locator('.billboard__trailer')).toHaveCount(0);
});

test('Home says what is the case when the Server will not say what to feature', async ({
  page,
  request,
}) => {
  await signIn(page);
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
    data: { failLibraryQueriesWith: 500 },
  });
  await page.reload();

  await expect(
    page.getByRole('alert').filter({
      hasText: 'Jellyflick could not read a Title to feature from the Server.',
    }),
  ).toBeVisible();
});
