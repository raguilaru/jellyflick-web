import type { APIRequestContext, Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * What only a laid-out page can say about a Title Label (#14): that it really
 * is *on the card art*, at the bottom of it, and painted in the User's Accent
 * Colour. The rules themselves are `test/unit/title-labels.test.ts`, where the
 * clock can be held still.
 *
 * A browser's clock is the real one, and the sample library is dated around a
 * fixed instant in 2026, so these tests re-date the library rather than wait
 * for the calendar: one Title added just now, everything else long ago.
 */

const PASSWORD = 'correct horse';

/** The default Accent Colour, `--accent` in `src/styles/base.css`. */
const ACCENT = 'rgb(209, 18, 27)';

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

/**
 * Re-dates the whole sample library: the named items as of now, the rest five
 * years ago. `POST /__fake/state` merges one level deep, so the items are read
 * back and handed over whole.
 */
async function addedJustNow(request: APIRequestContext, ids: readonly string[]): Promise<void> {
  const state = (await (await request.get(`${FAKE_JELLYFIN_URL}/__fake/state`)).json()) as {
    items: { Id: string; DateCreated: string }[];
  };
  const items = state.items.map((item) => ({
    ...item,
    DateCreated: ids.includes(item.Id) ? new Date().toISOString() : '2021-01-01T09:00:00Z',
  }));
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, { data: { items } });
}

test('a Title added just now is labelled, and one added years ago is not', async ({
  page,
  request,
}) => {
  await addedJustNow(request, ['movie-arrival']);

  await signIn(page);
  const row = page.getByRole('list', { name: 'New on Jellyflick' });

  await expect(row.getByRole('listitem', { name: 'Arrival' }).locator('.card__label')).toHaveText(
    'Recently Added',
  );
  await expect(row.getByRole('listitem', { name: 'Heat' }).locator('.card__label')).toHaveCount(0);
});

test('an Episode that arrived says its Series has New Episodes', async ({ page, request }) => {
  await addedJustNow(request, ['episode-bluey-s2e3']);

  await signIn(page);

  await expect(
    page.getByRole('listitem', { name: 'Bluey' }).locator('.card__label'),
  ).toHaveText('New Episodes');
});

test('the label sits across the bottom of the card art, in the Accent Colour', async ({
  page,
  request,
}) => {
  await addedJustNow(request, ['movie-arrival']);

  await signIn(page);
  const card = page.getByRole('listitem', { name: 'Arrival' });
  const label = card.locator('.card__label');
  await expect(label).toBeVisible();

  // Only a real layout can say where it landed: the label sits on the bottom of
  // the artwork — just clear of where a progress bar would be (#12) — and
  // starts at the artwork's left.
  const artwork = await card.locator('img.card__artwork').boundingBox();
  const drawn = await label.boundingBox();
  expect(artwork).not.toBeNull();
  expect(drawn).not.toBeNull();
  const artworkBottom = (artwork?.y ?? 0) + (artwork?.height ?? 0);
  const labelBottom = (drawn?.y ?? 0) + (drawn?.height ?? 0);
  expect(labelBottom).toBeLessThanOrEqual(artworkBottom + 0.5);
  expect(labelBottom).toBeGreaterThan(artworkBottom - 6);
  expect(Math.abs((drawn?.x ?? 0) - (artwork?.x ?? 0))).toBeLessThan(1.5);
  // Inside the art, not under it.
  expect(drawn?.height ?? 0).toBeLessThan(artwork?.height ?? 0);

  await expect(label).toHaveCSS('background-color', ACCENT);
});
