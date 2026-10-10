import type { Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/** The password every sample user on the fake Jellyfin has. */
const PASSWORD = 'correct horse';

/**
 * The order the sample library should come out in: every Movie and Series,
 * newest addition first, each Series once however many Episodes were added, and
 * nothing from the music library or the stray video file.
 */
const EXPECTED_ROW = ['Bluey', 'Severance', 'Paddington', 'Arrival', 'Heat', 'The Unfinished'];

test.afterEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

async function signIn(page: Page) {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
}

test('a signed-in User lands on Home and sees what is new across their libraries', async ({
  page,
}) => {
  await signIn(page);

  const row = page.getByRole('list', { name: 'New on Jellyflick' });
  await expect(row.getByRole('listitem')).toHaveCount(EXPECTED_ROW.length);
  await expect(row.locator('.card__name')).toHaveText(EXPECTED_ROW);
});

test('each card shows the Title’s artwork, and its name where there is none', async ({ page }) => {
  await signIn(page);

  const row = page.getByRole('list', { name: 'New on Jellyflick' });

  // A Series is shown by the Series' own artwork, not the Episode's that was
  // added, and the artwork is asked for at a card's width rather than full size.
  await expect(row.getByRole('listitem', { name: 'Bluey' }).locator('img')).toHaveAttribute(
    'src',
    `${FAKE_JELLYFIN_URL}/Items/series-bluey/Images/Primary?tag=tag-bluey&maxWidth=400`,
  );

  const unfinished = row.getByRole('listitem', { name: 'The Unfinished' });
  await expect(unfinished.locator('img')).toHaveCount(0);
  await expect(unfinished).toContainText('The Unfinished');
});

test('the Row asks every library that holds Titles, and no others', async ({ page, request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/requests`);

  await signIn(page);
  await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();

  const asked = (await recordedRequests(request))
    .filter((entry) => entry.path.startsWith('/Items/Latest'))
    .map((entry) => new URL(entry.path, FAKE_JELLYFIN_URL).searchParams.get('parentId'))
    .sort();

  // The music library is not asked at all: it cannot hold a Title.
  expect(asked).toEqual(['lib-kids', 'lib-movies', 'lib-series']);
});

test('Home says what is the case when the Server will not say what is new', async ({
  page,
  request,
}) => {
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
    data: { failLibraryQueriesWith: 500 },
  });

  await signIn(page);

  await expect(page.getByRole('alert')).toHaveText(
    'Jellyflick could not read what is new from the Server.',
  );
});

type RequestReader = { get(url: string): Promise<{ json(): Promise<unknown> }> };

async function recordedRequests(request: RequestReader): Promise<{ path: string }[]> {
  const response = await request.get(`${FAKE_JELLYFIN_URL}/__fake/requests`);
  return (await response.json()) as { path: string }[];
}
