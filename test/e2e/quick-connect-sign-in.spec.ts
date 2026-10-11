import type { Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Signing in with a code, for real: a production build in a browser, against
 * the fake Jellyfin's own Quick Connect endpoints (#9, story 12).
 *
 * The app polls every five seconds, which is the interval `jellyfin-api.md` §2
 * settles on, so the assertions that wait for an approval are given room for
 * one of those rather than the default five.
 *
 * These projects all run on a desktop Chromium, which reports a fine pointer
 * and so a `computer` device form — the code is therefore one press away
 * rather than the first thing offered. That a TV is offered it first is
 * `test/unit/quick-connect-journey.test.tsx`, where the device layer can be a
 * TV; no browser Playwright can drive reports itself as one.
 */

/** Longer than one poll interval, so an approval has a chance to be noticed. */
const PAST_ONE_POLL = { timeout: 20_000 };

test.beforeEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/requests`);
});

test.afterEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

test('a User gets a code, has it approved elsewhere, and is signed in', async ({
  page,
  request,
}) => {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });

  await page.getByRole('button', { name: 'Sign in with a code instead' }).press('Enter');

  const code = await codeOnScreen(page);
  expect(code).toMatch(/^\d{6}$/);

  // Approved in another Jellyfin app, by a User already signed in there.
  await approveCode(request, code, 'user-rafael');

  await expect(page.getByText('Signed in as Rafael.')).toBeVisible(PAST_ONE_POLL);

  // No password was ever asked for, which is the whole point of the flow.
  await expect(page.getByLabel('Password')).toHaveCount(0);
});

/**
 * The token belongs to the device being signed in, not to the one that
 * approved, and the app has to go on using the DeviceId it initiated with — the
 * Server allows a single token per DeviceId, so a second one would be a second
 * token and #8's several-Users model would come apart.
 */
test('the token it is given belongs to the DeviceId it initiated with', async ({
  page,
  request,
}) => {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Sign in with a code instead' }).press('Enter');
  const code = await codeOnScreen(page);
  await approveCode(request, code, 'user-rafael');
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible(PAST_ONE_POLL);

  const initiated = await deviceIdOfRequestTo(request, '/QuickConnect/Initiate');
  expect(initiated).toBeTruthy();

  // Every request the app has made since carries that same DeviceId, and the
  // token the Server derived from it.
  await expect
    .poll(() => lastTokenedRequest(request), PAST_ONE_POLL)
    .toMatchObject({ deviceId: initiated, token: `token-user-rafael-${String(initiated)}` });
});

/**
 * A code the Server no longer holds — it ran out of time there, or it was
 * turned down in the other app. The Server answers the same way for both and
 * says no more, so the message offers both readings and a new code.
 */
test('a code that stops working is explained, and a new one can be asked for', async ({
  page,
  request,
}) => {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Sign in with a code instead' }).press('Enter');
  const code = await codeOnScreen(page);

  // Gone from the Server, which is what an expiry and a refusal both look like.
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
    data: { quickConnect: { enabled: true, requests: [], codesIssued: 9 } },
  });

  await expect(page.getByRole('alert')).toHaveText(
    'That code no longer works. It may have run out of time, or been turned down in the other app. Get a new one and try again.',
    PAST_ONE_POLL,
  );

  await page.getByRole('button', { name: 'Get a new code' }).press('Enter');

  const replacement = await codeOnScreen(page);
  expect(replacement).not.toBe(code);
});

/**
 * "Shown large and readable from across a room" is a type question, and the
 * only place it can be measured is a real browser with a real layout. The
 * weight matters as much as the size: Bebas Neue has one weight, so anything
 * above 400 here would be a synthesised bold with smeared digits.
 */
test('the code is set large enough to read from across a room', async ({ page }) => {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Sign in with a code instead' }).press('Enter');
  await codeOnScreen(page);

  const type = await page.locator('.quick-connect__code').evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      fontSize: Number.parseFloat(style.fontSize),
      fontWeight: style.fontWeight,
      letterSpacing: style.letterSpacing,
    };
  });

  expect(type.fontSize).toBeGreaterThanOrEqual(56);
  // The single weight the family has. A bold would be drawn by the browser.
  expect(type.fontWeight).toBe('400');
  // Wide tracking is the other half of reading digits at a distance.
  expect(Number.parseFloat(type.letterSpacing)).toBeGreaterThan(0);
});

/** The code the app is showing, once it has one. */
async function codeOnScreen(page: Page): Promise<string> {
  const code = page.locator('.quick-connect__code');
  await expect(code).toBeVisible();
  await expect(code).toHaveText(/^\d{6}$/);
  return ((await code.textContent()) ?? '').trim();
}

type Requester = {
  get(url: string): Promise<{ json(): Promise<unknown> }>;
  post(url: string, options: { headers?: Record<string, string> }): Promise<{ ok(): boolean }>;
};

/**
 * Approves a code the way another Jellyfin app does: `POST
 * /QuickConnect/Authorize`, as a User signed in there. Jellyflick itself never
 * calls that endpoint, so there is no gateway method for it.
 *
 * The token is minted rather than earned by signing in first. The fake derives
 * a token from the user and the DeviceId (`token-<userId>-<deviceId>`), which
 * is how `test/unit/gateway.test.ts` builds one too, and the approving app's
 * own sign-in is not what is under test here.
 */
async function approveCode(request: Requester, code: string, userId: string): Promise<void> {
  const deviceId = `approving-app-${code}`;
  const response = await request.post(
    `${FAKE_JELLYFIN_URL}/QuickConnect/Authorize?code=${encodeURIComponent(code)}&userId=${encodeURIComponent(userId)}`,
    {
      headers: {
        Authorization: [
          'MediaBrowser Client="Other%20Jellyfin%20App"',
          'Device="Another%20Device"',
          `DeviceId="${deviceId}"`,
          'Version="e2e"',
          `Token="token-${userId}-${deviceId}"`,
        ].join(', '),
      },
    },
  );
  expect(response.ok(), `approving ${code}`).toBe(true);
}

type SeenRequest = {
  method: string;
  path: string;
  headers: Record<string, string>;
};

async function recordedRequests(request: Requester): Promise<SeenRequest[]> {
  const response = await request.get(`${FAKE_JELLYFIN_URL}/__fake/requests`);
  return (await response.json()) as SeenRequest[];
}

/** The DeviceId on the newest request to one path. */
async function deviceIdOfRequestTo(
  request: Requester,
  path: string,
): Promise<string | undefined> {
  const matching = (await recordedRequests(request)).filter((entry) =>
    entry.path.startsWith(path),
  );
  const authorization = matching[matching.length - 1]?.headers.authorization ?? '';
  return /DeviceId="([^"]+)"/.exec(authorization)?.[1];
}

/** The DeviceId and token on the newest request that carried a token at all. */
async function lastTokenedRequest(
  request: Requester,
): Promise<{ deviceId?: string; token?: string }> {
  const tokened = (await recordedRequests(request)).filter((entry) =>
    (entry.headers.authorization ?? '').includes('Token="'),
  );
  const authorization = tokened[tokened.length - 1]?.headers.authorization ?? '';
  return {
    deviceId: /DeviceId="([^"]+)"/.exec(authorization)?.[1],
    token: /Token="([^"]+)"/.exec(authorization)?.[1],
  };
}
