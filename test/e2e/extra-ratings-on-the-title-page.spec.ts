/**
 * The extra ratings an MDBList key buys (#20), end to end in a real browser:
 * the real container holding the key and proxying MDBList, the real production
 * build reading its route, and a real layout to look at.
 *
 * **MDBList is the one thing faked, and it is faked at the HTTP level** — the
 * container is handed a `fetch` that answers for it, exactly as
 * `test/unit/container-server.test.ts` does. Everything between the browser and
 * that seam is real.
 *
 * What only a browser can show, and what Vitest cannot:
 *
 * - **that the badges fit.** A row of four source names and four scores is the
 *   shape that runs off the side of a phone, and no test that only reads the
 *   document would notice: Playwright scrolls an element into view before
 *   touching it, so an overflowing row is still "visible". The page's own
 *   scroll width is asserted instead.
 * - that the key never reaches the browser while the ratings are on the screen,
 *   which is ADR 0004's whole point.
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Page } from '@playwright/test';
import { startJellyflickServer, type JellyflickServer } from '../../server/jellyflick-server';
import { expect, FAKE_JELLYFIN_URL, test } from './fixtures';

const DIST = join(import.meta.dirname, '..', '..', 'dist');
const ENTRYPOINT = join(import.meta.dirname, '..', '..', 'deploy', 'entrypoint.sh');

/** The password every sample user on the fake Jellyfin has. */
const PASSWORD = 'correct horse';

/** The key the host set. It must appear nowhere a browser can read it. */
const HOST_KEY = 'secret-key-42';

/**
 * What MDBList answers for Arrival, in **MDBList's own vocabulary**: a whole
 * captured response is `test/fixtures/mdblist.ts`. `tomatoes` and `imdb` are in
 * it on purpose — the Server already sends both as `CriticRating` and
 * `CommunityRating`, and the page must not show either of them twice — and
 * Rotten Tomatoes' audience score is `popcorn`, which the app draws under its
 * own name, "Audience" (#45).
 */
const ARRIVAL_RATINGS = {
  title: 'Arrival',
  ratings: [
    { source: 'tomatoes', value: 94 },
    { source: 'popcorn', value: 82 },
    { source: 'metacritic', value: 81 },
    { source: 'letterboxd', value: 3.9 },
    { source: 'trakt', value: 78 },
  ],
};

/** A stand-in for MDBList: the upstream, and nothing else, is faked. */
function fakeMdbList(body: unknown): typeof globalThis.fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof globalThis.fetch;
}

/**
 * Starts the container the way `docker run` would, with MDBList standing in for
 * itself. An empty key is a host who never set one.
 */
async function runContainer(options: {
  mdbListApiKey: string;
  ratings?: unknown;
}): Promise<JellyflickServer> {
  const configDir = mkdtempSync(join(tmpdir(), 'jellyflick-ratings-e2e-'));
  execFileSync('sh', [ENTRYPOINT, 'true'], {
    env: {
      PATH: process.env.PATH ?? '',
      JELLYFLICK_CONFIG_DIR: configDir,
      JELLYFIN_URL: FAKE_JELLYFIN_URL,
    },
  });
  return startJellyflickServer({
    root: DIST,
    configDir,
    mdbListApiKey: options.mdbListApiKey,
    fetch: fakeMdbList(options.ratings ?? ARRIVAL_RATINGS),
  });
}

let container: JellyflickServer | undefined;

test.afterEach(async ({ request }) => {
  await container?.close();
  container = undefined;
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

/** Signs in and opens Arrival's page, which is the Title with provider ids. */
async function openArrival(page: Page, url: string): Promise<void> {
  await page.goto(url);
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await page
    .getByRole('list', { name: 'New on Jellyflick' })
    .getByRole('listitem', { name: 'Arrival' })
    .press('Enter');
  await expect(page.getByRole('heading', { name: 'Arrival', level: 1 })).toBeVisible();
}

/** Whether the document is wider than the window, which is the bug to catch. */
function overflowsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

test('a host with an MDBList key gets the extra sources on a Title', async ({ page }) => {
  container = await runContainer({ mdbListApiKey: HOST_KEY });

  await openArrival(page, container.url);

  const ratings = page.getByRole('list', { name: 'Ratings' });
  await expect(ratings.getByRole('listitem')).toHaveText([
    'Audience 82%',
    'Metacritic 81%',
    'Letterboxd 3.9/5',
    'Trakt 78%',
  ]);
  // The Server's own two are still where they were, and are not repeated among
  // the extras even though MDBList answered with both.
  await expect(page.getByText('94% critics')).toBeVisible();
  await expect(page.getByText('7.9 from the community')).toBeVisible();
});

test('the extra ratings fit on the screen, at a phone width and at a desktop one', async ({
  page,
}) => {
  container = await runContainer({ mdbListApiKey: HOST_KEY });

  await openArrival(page, container.url);

  // The project's own width first, then the narrowest the app supports. A row
  // of badges is exactly the shape that runs off the side of a small screen.
  await expect(page.getByRole('list', { name: 'Ratings' })).toBeVisible();
  expect(await overflowsSideways(page)).toBe(false);

  await page.setViewportSize({ width: 375, height: 700 });
  await expect(page.getByRole('list', { name: 'Ratings' })).toBeVisible();
  expect(await overflowsSideways(page)).toBe(false);
});

test('a host who set no MDBList key gets a page with nothing missing from it', async ({
  page,
}) => {
  container = await runContainer({ mdbListApiKey: '' });

  await openArrival(page, container.url);

  // Not an empty list and not a heading over nothing (story 81).
  await expect(page.getByRole('list', { name: 'Ratings' })).toHaveCount(0);
  await expect(page.getByText('94% critics')).toBeVisible();
});

test('the key is nowhere the browser can read it, ratings on the screen or not', async ({
  page,
}) => {
  container = await runContainer({ mdbListApiKey: HOST_KEY });

  await openArrival(page, container.url);
  await expect(page.getByRole('list', { name: 'Ratings' })).toBeVisible();

  // Everything the browser has: the config it booted from, and the answer the
  // ratings came in. ADR 0004 keeps the key inside the container.
  const config = await page.evaluate(() =>
    fetch('/config.js').then((response) => response.text()),
  );
  const answer = await page.evaluate(() =>
    fetch('/api/ratings/imdb/movie/tt2543164').then((response) => response.text()),
  );

  expect(config).not.toContain(HOST_KEY);
  expect(answer).not.toContain(HOST_KEY);
  expect(JSON.stringify(await page.evaluate(() => window.__JELLYFLICK_CONFIG__))).not.toContain(
    HOST_KEY,
  );
});
