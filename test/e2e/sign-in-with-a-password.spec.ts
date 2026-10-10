import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/** The password every sample user on the fake Jellyfin has. */
const PASSWORD = 'correct horse';

test.beforeEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/requests`);
});

test.afterEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

test('a User picks themselves from the public list and signs in', async ({ page }) => {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });

  // Pictures where the Server has one, the initial where it has not.
  await expect(page.getByRole('button', { name: 'Rafael' }).locator('img')).toHaveAttribute(
    'src',
    `${FAKE_JELLYFIN_URL}/UserImage?userId=user-rafael&tag=tag-rafael`,
  );
  await expect(page.getByRole('button', { name: 'Nico' }).locator('img')).toHaveCount(0);
  // A hidden account is not listed, which is what the typed path is for.
  await expect(page.getByRole('button', { name: 'Ghost' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');

  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
});

test('a User whose account is hidden types their username instead', async ({ page }) => {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });

  await page.getByRole('button', { name: 'Type a username instead' }).press('Enter');
  await page.getByLabel('Username').fill('Ghost');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');

  await expect(page.getByText('Signed in as Ghost.')).toBeVisible();
});

test('a wrong password is explained and the password can be typed again', async ({ page }) => {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });

  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill('not it');
  await page.getByLabel('Password').press('Enter');

  await expect(page.getByRole('alert')).toHaveText(
    'That username and password do not match an account on this Server.',
  );

  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');

  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
});

test('the token and DeviceId survive a reload, and every request carries them', async ({
  page,
  request,
}) => {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();

  // The DeviceId the token was issued against.
  const deviceId = await deviceIdOfRequestTo(request, '/Users/AuthenticateByName');
  expect(deviceId).toBeTruthy();

  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/requests`);
  await page.reload();

  // No password is asked for a second time.
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveCount(0);

  // The request it made after the reload carried the stored token, on the same
  // DeviceId, because the Server allows one token per DeviceId.
  await expect
    .poll(() => deviceIdOfLastTokenedRequest(request))
    .toBe(deviceId);
});

test('a Server that no longer accepts the token asks for a password again', async ({
  page,
  request,
}) => {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();

  // The token was revoked, or the account is gone.
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, { data: { users: [] } });
  await page.reload();

  await expect(page.getByLabel('Username')).toBeVisible();
  await expect(page.getByText('Signed in as Rafael.')).toHaveCount(0);
});

/**
 * No request may use a legacy auth method, so every one is checked for a
 * `MediaBrowser` header and against the legacy forms the Server has turned off.
 */
test('every request identifies itself with the MediaBrowser header and nothing legacy', async ({
  page,
  request,
}) => {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();

  // `/UserImage` is loaded by the browser as an `<img src>`, not by the
  // gateway, and the Server serves it anonymously, so it carries no header.
  const seen = (await recordedRequests(request)).filter(
    (entry) => !entry.path.startsWith('/UserImage'),
  );
  expect(seen.length).toBeGreaterThan(0);
  for (const entry of seen) {
    const authorization = entry.headers.authorization ?? '';
    expect(authorization, `${entry.method} ${entry.path}`).toMatch(
      /^MediaBrowser Client="Jellyflick", Device="[^"]+", DeviceId="[^"]+", Version="[^"]+"/,
    );
    expect(entry.headers['x-emby-authorization']).toBeUndefined();
    expect(entry.headers['x-emby-token']).toBeUndefined();
    expect(entry.headers['x-mediabrowser-token']).toBeUndefined();
    expect(entry.path).not.toContain('api_key=');
  }
});

type RequestReader = { get(url: string): Promise<{ json(): Promise<unknown> }> };

type SeenRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
};

async function recordedRequests(request: RequestReader): Promise<SeenRequest[]> {
  const response = await request.get(`${FAKE_JELLYFIN_URL}/__fake/requests`);
  return (await response.json()) as SeenRequest[];
}

/** The DeviceId on the newest request that carried a token. */
async function deviceIdOfLastTokenedRequest(
  request: RequestReader,
): Promise<string | undefined> {
  const tokened = (await recordedRequests(request)).filter((entry) =>
    (entry.headers.authorization ?? '').includes('Token="'),
  );
  return deviceIdOf(tokened[tokened.length - 1]);
}

/** The DeviceId on the newest request to one path. */
async function deviceIdOfRequestTo(
  request: RequestReader,
  path: string,
): Promise<string | undefined> {
  const matching = (await recordedRequests(request)).filter((entry) => entry.path === path);
  return deviceIdOf(matching[matching.length - 1]);
}

function deviceIdOf(entry: SeenRequest | undefined): string | undefined {
  return /DeviceId="([^"]+)"/.exec(entry?.headers.authorization ?? '')?.[1];
}
