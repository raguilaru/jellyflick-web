/**
 * The container, end to end, in a real browser: the real entrypoint renders the
 * runtime config, the real server serves the real production build, and the app
 * boots from it.
 *
 * This is the closest check that does not need a Docker daemon. What it cannot
 * cover is the image itself — the layering, `apk add jq`, the `node` user and
 * the tmpfs — which only `docker build` and `docker run` exercise.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startJellyflickServer, type JellyflickServer } from '../../server/jellyflick-server';
import { expect, FAKE_JELLYFIN_URL, test } from './fixtures';

const DIST = join(import.meta.dirname, '..', '..', 'dist');
const ENTRYPOINT = join(import.meta.dirname, '..', '..', 'deploy', 'entrypoint.sh');

/**
 * Starts the container the way `docker run` would: the entrypoint renders the
 * config from the environment, then the server is handed the process.
 */
async function runContainer(environment: Record<string, string>): Promise<JellyflickServer> {
  const configDir = mkdtempSync(join(tmpdir(), 'jellyflick-e2e-config-'));
  execFileSync('sh', [ENTRYPOINT, 'true'], {
    env: { PATH: process.env.PATH ?? '', JELLYFLICK_CONFIG_DIR: configDir, ...environment },
  });
  return startJellyflickServer({
    root: DIST,
    configDir,
    mdbListApiKey: environment.MDBLIST_API_KEY ?? '',
  });
}

let container: JellyflickServer | undefined;

test.afterEach(async ({ request }) => {
  await container?.close();
  container = undefined;
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

test('a preset Server address set on the container reaches the browser', async ({ page }) => {
  container = await runContainer({ JELLYFIN_URL: FAKE_JELLYFIN_URL, APP_VERSION: '1.4.0' });

  await page.goto(container.url);

  // The preset address connects on its own, so the app goes straight to asking
  // who is watching and never asks for an address.
  await expect(page.getByRole('heading', { name: 'Choose your User' })).toBeVisible();
  await expect(page.getByLabel('Server address')).toHaveCount(0);
});

test('an empty Server address setting still serves a working app', async ({ page }) => {
  container = await runContainer({ JELLYFIN_URL: '' });

  await page.goto(container.url);

  const address = page.getByLabel('Server address');
  await expect(address).toBeVisible();

  await address.fill(FAKE_JELLYFIN_URL);
  await address.press('Enter');
  await expect(page.getByRole('heading', { name: 'Choose your User' })).toBeVisible();
});

test('a deep link answers with the app rather than a 404, so a reload works', async ({ page }) => {
  container = await runContainer({ JELLYFIN_URL: FAKE_JELLYFIN_URL });

  const response = await page.goto(`${container.url}/title/abc`);

  expect(response?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Choose your User' })).toBeVisible();
});

/**
 * The licence texts (#48). Serving libass and the rest to a browser is what
 * makes this distribution, so the texts have to be *in the image* and
 * reachable from the running app — not merely committed.
 *
 * This is the assertion that claim wants, rather than a promise in a doc. It
 * runs against the real production build in `dist/` through the real server,
 * and `dist/` reaches the image as one `COPY --from=build /app/dist /srv/app`,
 * so a text that is served here is a text the image carries. What it still
 * cannot cover is the same thing the rest of this file cannot: the layering
 * and the `node` user, which only `docker run` exercises.
 */
test.describe('the licence texts travel with it', () => {
  /** Every text the notice points at, as `public/licences/` ships them. */
  const TEXTS = [
    'NOTICE.txt',
    'LGPL-2.1.txt',
    'FTL.txt',
    'harfbuzz-MIT.txt',
    'Apache-2.0.txt',
    'GPL-3.0.txt',
    'liberation-sans-OFL.txt',
  ];

  test('the notice is served, and says what it has to say', async ({ page }) => {
    container = await runContainer({ JELLYFIN_URL: FAKE_JELLYFIN_URL });

    const response = await page.goto(`${container.url}/licences/NOTICE.txt`);

    expect(response?.status()).toBe(200);
    // Plain text, so a browser shows it rather than offering to download it.
    expect(response?.headers()['content-type']).toContain('text/plain');

    const notice = (await response?.text()) ?? '';
    // The three things an LGPL notice owes, for the component that owes them.
    expect(notice).toContain('libass');
    expect(notice).toContain('LGPL-2.1-or-later');
    expect(notice).toContain('github.com/libass/libass');
  });

  test('every text the notice points at is served too', async ({ request }) => {
    container = await runContainer({ JELLYFIN_URL: FAKE_JELLYFIN_URL });
    const base = container.url;

    for (const name of TEXTS) {
      const response = await request.get(`${base}/licences/${name}`);
      expect(response.status(), `${name} is not served`).toBe(200);
      expect((await response.text()).length, `${name} is served empty`).toBeGreaterThan(500);
    }

    // And the copyleft text is the real one, not a stub naming it: this is the
    // file a reader following the notice actually needs.
    const lgpl = await (await request.get(`${base}/licences/LGPL-2.1.txt`)).text();
    expect(lgpl).toContain('GNU LESSER GENERAL PUBLIC LICENSE');

    // The font's licence has always sat beside the font rather than in
    // `licences/`, and that is still served.
    const bebas = await request.get(`${base}/fonts/bebas-neue-OFL.txt`);
    expect(bebas.status()).toBe(200);
  });

  /*
   * Whether a *User* reaches the texts is deliberately not tested here. That
   * is `settings.spec.ts`, which follows the link from the settings screen
   * against the same production build and in all three projects, including
   * keyboard-only. What only this file can prove is the half above: the texts
   * are in `dist/` — the directory the image is built from — and the real
   * server hands them over as plain text. Re-driving the sign-in journey here
   * would duplicate that for nothing.
   */
});

test('the MDBList key is nowhere the browser can read it', async ({ page }) => {
  container = await runContainer({
    JELLYFIN_URL: FAKE_JELLYFIN_URL,
    MDBLIST_API_KEY: 'secret-key-42',
  });

  await page.goto(container.url);
  const config = await page.evaluate(() =>
    fetch('/config.js').then((response) => response.text()),
  );
  const exposed = await page.evaluate(() => JSON.stringify(window.__JELLYFLICK_CONFIG__));

  expect(config).not.toContain('secret-key-42');
  expect(exposed).not.toContain('secret-key-42');
  expect(JSON.parse(exposed ?? '{}')).toEqual({
    serverAddress: FAKE_JELLYFIN_URL,
    appVersion: 'dev',
  });
});
