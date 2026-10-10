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

  await expect(page.getByText('Connected to Fake Jellyfin.')).toBeVisible();
  await expect(page.getByLabel('Server address')).toHaveCount(0);
});

test('an empty Server address setting still serves a working app', async ({ page }) => {
  container = await runContainer({ JELLYFIN_URL: '' });

  await page.goto(container.url);

  const address = page.getByLabel('Server address');
  await expect(address).toBeVisible();

  await address.fill(FAKE_JELLYFIN_URL);
  await address.press('Enter');
  await expect(page.getByText('Connected to Fake Jellyfin.')).toBeVisible();
});

test('a deep link answers with the app rather than a 404, so a reload works', async ({ page }) => {
  container = await runContainer({ JELLYFIN_URL: FAKE_JELLYFIN_URL });

  const response = await page.goto(`${container.url}/title/abc`);

  expect(response?.status()).toBe(200);
  await expect(page.getByText('Connected to Fake Jellyfin.')).toBeVisible();
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
