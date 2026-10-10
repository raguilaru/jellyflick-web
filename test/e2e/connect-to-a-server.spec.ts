import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

test.afterEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

test('a preset Server address takes the User straight past the address screen', async ({ page }) => {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });

  // Connecting hands over to signing in, so the Server's Users come next.
  await expect(page.getByText('Choose your User')).toBeVisible();
  await expect(page.getByLabel('Server address')).toHaveCount(0);
});

test('an empty preset asks the User for an address and then connects', async ({ page }) => {
  await openApp(page);

  const address = page.getByLabel('Server address');
  await expect(address).toBeVisible();

  // Typed and submitted from the keyboard alone, so this passes in the
  // keyboard-only project too.
  await address.fill(FAKE_JELLYFIN_URL);
  await address.press('Enter');

  await expect(page.getByText('Choose your User')).toBeVisible();
});

test('a Server older than 12.0 is refused with the version it found', async ({ page, request }) => {
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
    data: { systemInfo: { Version: '10.10.7' } },
  });
  await openApp(page);

  const address = page.getByLabel('Server address');
  await address.fill(FAKE_JELLYFIN_URL);
  await address.press('Enter');

  await expect(page.getByRole('alert')).toHaveText(
    'That server runs Jellyfin 10.10.7. Jellyflick needs 12.0 or later, so it cannot connect to it.',
  );
});

test('an address nothing answers on is explained rather than left silent', async ({ page }) => {
  await openApp(page);

  const address = page.getByLabel('Server address');
  await address.fill('http://127.0.0.1:1');
  await address.press('Enter');

  await expect(page.getByRole('alert')).toContainText('Nothing answered at http://127.0.0.1:1');
});
