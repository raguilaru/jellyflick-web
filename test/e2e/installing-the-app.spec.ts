/**
 * Story 110: the app installs to a home screen or a desktop and opens
 * full-screen with its own icon.
 *
 * Playwright cannot press a browser's own Install button, so what is checkable
 * is everything the browser reads before offering it: the manifest is linked
 * from the shipped document, it parses, every icon it declares is really
 * there, and its `start_url` serves the app. `test/unit/installable-app.test.ts`
 * owns what the manifest says; this owns that the built, served app really
 * carries it.
 */
import { expect, test } from './fixtures';

test('the built app links a manifest a browser can read', async ({ page }) => {
  await page.goto('/');

  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBe('/manifest.webmanifest');

  const response = await page.request.get(href ?? '');
  expect(response.status()).toBe(200);
  // Not `application/json`: a browser only treats it as a manifest under its
  // own type, and the container's content-type table is what supplies it.
  expect(response.headers()['content-type']).toBe('application/manifest+json');

  const manifest = (await response.json()) as { name: string; display: string; icons: unknown[] };
  expect(manifest.name).toBe('Jellyflick');
  expect(manifest.display).toBe('standalone');
  expect(manifest.icons.length).toBeGreaterThan(0);
});

test('every icon the manifest declares is really served', async ({ page }) => {
  await page.goto('/');

  const manifest = (await (await page.request.get('/manifest.webmanifest')).json()) as {
    icons: { src: string }[];
  };
  const sources = [
    ...manifest.icons.map((icon) => icon.src),
    // iOS reads none of the above.
    await page.locator('link[rel="apple-touch-icon"]').getAttribute('href'),
  ];

  for (const src of sources) {
    const response = await page.request.get(src ?? '');
    expect(response.status(), `${String(src)} is declared but not served`).toBe(200);
    expect(response.headers()['content-type']).toBe('image/png');
  }
});

test("the manifest's start_url opens the app", async ({ page }) => {
  const manifest = (await (await page.request.get('/manifest.webmanifest')).json()) as {
    start_url: string;
  };

  const response = await page.goto(manifest.start_url);

  expect(response?.status()).toBe(200);
  await expect(page.getByLabel('Server address')).toBeVisible();
});

test('nothing registers a service worker, so an update needs nothing cleared', async ({ page }) => {
  await page.goto('/');

  // A worker would survive this page and keep serving whatever it had. The app
  // installs without one (decisions.md §8), so the next load is always the new
  // build and there is nothing for the User to clear.
  const registrations = await page.evaluate(() =>
    navigator.serviceWorker.getRegistrations().then((all) => all.length),
  );

  expect(registrations).toBe(0);
});
