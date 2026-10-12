import type { Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * A Series on its title page in a real browser (#18): the Season picker, the
 * Episode list, and Play starting the right Episode.
 *
 * What is only observable here is the laid-out page — happy-dom gives every
 * element a zero-sized rectangle, so no unit test can see where the arrow keys
 * go, and the keyboard-only project drives the whole thing with no pointer at
 * all. The rules themselves are unit tests:
 * `test/unit/choosing-an-episode.test.ts` and
 * `test/unit/series-on-the-title-page.test.tsx`.
 *
 * Bluey is the Series with Seasons and Episodes in the sample library.
 */

const PASSWORD = 'correct horse';

const TICKS_PER_MINUTE = 60 * 10_000_000;

test.afterEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

async function signIn(page: Page): Promise<void> {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();
}

/** Opens Bluey's page from Home. Enter, because a remote has no pointer. */
async function openBluey(page: Page): Promise<void> {
  await page
    .getByRole('list', { name: 'New on Jellyflick' })
    .getByRole('listitem', { name: 'Bluey' })
    .press('Enter');
  await expect(page.getByRole('heading', { name: 'Bluey', level: 1 })).toBeVisible();
  await expect(page.getByRole('list', { name: 'Episodes' })).toBeVisible();
}

/** What focus is on, by the name a User would hear for it. */
function focused(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) return null;
    return active.getAttribute('aria-label') ?? active.textContent;
  });
}

function episodes(page: Page) {
  return page.getByRole('list', { name: 'Episodes' }).locator('.episode__name');
}

test('offers the Seasons and lists the chosen one’s Episodes', async ({ page }) => {
  await signIn(page);
  await openBluey(page);

  const picker = page.getByRole('group', { name: 'Seasons' });
  await expect(picker.getByRole('button')).toHaveText(['Season 1', 'Season 2']);
  // Nobody has watched anything, so the list opens where Play would start.
  await expect(picker.getByRole('button', { name: 'Season 1' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await expect(episodes(page)).toHaveText(['1. The Magic Xylophone', '2. Hotel']);
  // The still, the description and the length, which is what the list is for.
  await expect(page.getByText('Bandit is frozen by a magic xylophone.')).toBeVisible();
  // The still is asked for against the **Episode**, not its Series: a list of
  // Episodes shows the picture from each one. Its URL rather than its pixels,
  // as every other spec does — the fake answers the image routes with JSON.
  await expect(
    page.getByRole('list', { name: 'Episodes' }).locator('.episode__still').first(),
  ).toHaveAttribute(
    'src',
    `${FAKE_JELLYFIN_URL}/Items/episode-bluey-s1e1/Images/Primary?tag=tag-bluey-s1e1&maxWidth=320`,
  );

  await picker.getByRole('button', { name: 'Season 2' }).press('Enter');

  await expect(episodes(page)).toHaveText(['2. The Pool', '3. Sleepytime']);
});

test('shows how far through an Episode the User is', async ({ page, request }) => {
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
    data: {
      playbackPositions: { 'user-rafael': { 'episode-bluey-s1e1': 3.5 * TICKS_PER_MINUTE } },
    },
  });
  await signIn(page);
  await openBluey(page);

  const bar = page.getByRole('list', { name: 'Episodes' }).getByRole('progressbar').first();
  await expect(bar).toHaveAttribute('aria-valuenow', '50');
});

test('Play starts the Episode the User is up to, and tells the Server which', async ({
  page,
  request,
}) => {
  // Season 1 watched, so the Episode to play is the first of Season 2.
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
    data: { played: { 'user-rafael': ['episode-bluey-s1e1', 'episode-bluey-s1e2'] } },
  });
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);
  await signIn(page);
  await openBluey(page);

  await expect(page.getByRole('group', { name: 'Seasons' }).getByRole('button', {
    name: 'Season 2',
  })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Play', exact: true }).press('Enter');

  // The player is headed with the Series and the Episode, so a User watching
  // knows which show this is.
  await expect(page.getByRole('region', { name: 'Playing Bluey: The Pool' })).toBeVisible();
  // And the Server was told the Episode is what is playing, not the Series.
  await expect
    .poll(async () => {
      const writes = (await (
        await request.get(`${FAKE_JELLYFIN_URL}/__fake/writes`)
      ).json()) as { path: string; body: { ItemId?: string } }[];
      return writes
        .filter((write) => write.path === '/Sessions/Playing')
        .map((write) => write.body.ItemId);
    })
    .toEqual(['episode-bluey-s2e2']);
});

test('marks one Episode watched, and the Server holds it', async ({ page, request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);
  await signIn(page);
  await openBluey(page);

  await page.getByRole('button', { name: 'Mark Hotel as watched' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Mark Hotel as not watched' })).toBeVisible();

  const writes = (await (
    await request.get(`${FAKE_JELLYFIN_URL}/__fake/writes`)
  ).json()) as { method: string; path: string }[];
  expect(
    writes
      .filter((write) => write.path.startsWith('/UserPlayedItems/'))
      .map((write) => [write.method, write.path]),
  ).toEqual([['POST', '/UserPlayedItems/episode-bluey-s1e2']]);

  // The page reads it again from scratch, so this is the Server's answer.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mark Hotel as not watched' })).toBeVisible();
});

test('the picker and the Episodes are driveable with nothing but the arrow keys', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'keyboard-only', 'this is the remote’s journey');

  await signIn(page);
  await openBluey(page);

  // In from nothing focused, so the first presses enter the page rather than
  // stepping out of the card that opened it.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  for (let press = 0; press < 10 && (await focused(page)) !== 'Season 1'; press += 1) {
    await page.keyboard.press('ArrowDown');
  }
  expect(await focused(page)).toBe('Season 1');

  // The Seasons are a line, reached geometrically: no focus group, because a
  // Season is picked once and there is nothing to come back to.
  await page.keyboard.press('ArrowRight');
  expect(await focused(page)).toBe('Season 2');
  await page.keyboard.press('ArrowLeft');
  expect(await focused(page)).toBe('Season 1');

  // And Down steps into the list: the Episode, then its own watched toggle.
  await page.keyboard.press('ArrowDown');
  expect(await focused(page)).toContain('The Magic Xylophone');
  await page.keyboard.press('ArrowDown');
  expect(await focused(page)).toContain('Mark The Magic Xylophone');
});
