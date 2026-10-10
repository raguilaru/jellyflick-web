import type { Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/** The password every sample user on the fake Jellyfin has. */
const PASSWORD = 'correct horse';

/** Below this width the bottom bar takes over. Mirrors `src/shell/layout.ts`. */
const PHONE_WIDTH = 768;

test.afterEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

/**
 * The shell is what a signed-in User sees, so every test signs one in. Only the
 * keyboard is used, so these pass in the keyboard-only project too.
 */
async function signIn(page: Page): Promise<void> {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByRole('navigation')).toBeVisible();
}

test('a section keeps its own address, so it survives a reload', async ({ page }) => {
  await signIn(page);

  await page.getByRole('link', { name: 'Search' }).press('Enter');
  await expect(page).toHaveURL(/\/search$/);

  await page.reload();

  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();
});

test('the Back key and the browser’s back button both leave a section', async ({ page }) => {
  await signIn(page);

  await page.getByRole('link', { name: 'Search' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();

  // The remote's Back key, as a keyboard sends it.
  await page.keyboard.press('Escape');
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
  await expect(page).toHaveURL(/\/$/);

  await page.getByRole('link', { name: 'Search' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Search' })).toBeVisible();

  // The browser's own back button, which is the same handler.
  await page.goBack();
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
});

test('the wordmark is drawn in the condensed face the app serves itself', async ({ page }) => {
  await signIn(page);

  // Served from our own origin: the app has to work on a LAN with no internet.
  const font = await page.request.get('/fonts/bebas-neue-latin-400.woff2');
  expect(font.status()).toBe(200);

  // And really drawn with it, rather than silently falling back.
  await expect.poll(() => page.evaluate(() => document.fonts.check('30px "Bebas Neue"'))).toBe(
    true,
  );
});

test.describe('on a wide screen', () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) < PHONE_WIDTH,
    'the top bar is for wide screens',
  );

  test('the top bar carries every section', async ({ page }) => {
    await signIn(page);

    const topBar = page.getByRole('banner');
    for (const name of ['Home', 'Movies', 'Series', 'My List', 'Search']) {
      await expect(topBar.getByRole('link', { name, exact: true })).toBeVisible();
    }
    // The bottom bar belongs to phone widths, and only one bar is ever shown.
    await expect(page.getByRole('navigation')).toHaveCount(1);
  });

  test('each section opens from the top bar, and says which one it is on', async ({ page }) => {
    await signIn(page);

    await page.getByRole('link', { name: 'Movies' }).press('Enter');

    await expect(page.getByRole('heading', { name: 'Movies' })).toBeVisible();
    await expect(page).toHaveURL(/\/movies$/);
    await expect(page.getByRole('link', { name: 'Movies' })).toHaveAttribute(
      'aria-current',
      'page',
    );

    await page.getByRole('link', { name: 'Series' }).press('Enter');

    await expect(page.getByRole('heading', { name: 'Series' })).toBeVisible();
    await expect(page).toHaveURL(/\/series$/);
  });

  test('the top bar stops being transparent once the page is scrolled', async ({ page }) => {
    await signIn(page);

    const transparent = 'rgba(0, 0, 0, 0)';
    expect(await backgroundOfTopBar(page)).toBe(transparent);

    await page.evaluate(() => {
      window.scrollTo(0, 400);
    });

    // Scrolled at all, so the check below cannot pass on a page that never moved.
    expect(await page.evaluate(() => window.pageYOffset)).toBeGreaterThan(0);
    await expect.poll(() => backgroundOfTopBar(page)).not.toBe(transparent);
  });
});

test.describe('on a phone', () => {
  test.skip(
    ({ viewport }) => (viewport?.width ?? 0) >= PHONE_WIDTH,
    'the bottom bar is for phone widths',
  );

  test('the bottom bar carries Home, Search, My List and who is watching', async ({ page }) => {
    await signIn(page);

    const bottomBar = page.getByRole('navigation');
    for (const name of ['Home', 'Search', 'My List']) {
      await expect(bottomBar.getByRole('link', { name, exact: true })).toBeVisible();
    }
    await expect(bottomBar.getByText('Rafael')).toBeVisible();

    // The wordmark and the top bar's own links belong to wider screens.
    await expect(page.getByRole('banner')).toHaveCount(0);
  });

  test('a section opens from the bottom bar, and says which one it is on', async ({ page }) => {
    await signIn(page);

    await page.getByRole('link', { name: 'My List' }).press('Enter');

    await expect(page.getByRole('heading', { name: 'My List' })).toBeVisible();
    await expect(page).toHaveURL(/\/my-list$/);
    await expect(page.getByRole('link', { name: 'My List' })).toHaveAttribute(
      'aria-current',
      'page',
    );
  });
});

function backgroundOfTopBar(page: Page): Promise<string> {
  return page
    .getByRole('banner')
    .evaluate((bar) => window.getComputedStyle(bar).backgroundColor);
}
