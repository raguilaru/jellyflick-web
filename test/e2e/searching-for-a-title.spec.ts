import type { Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Search in a real browser: live results as the User types, only Movies and
 * Series among them, and browsing by genre when they do not know what they
 * want (stories 59 and 60).
 *
 * Everything here is driven from the keyboard, so these pass in the
 * keyboard-only project too — which is the one that proves the screen works on
 * a TV remote (story 64).
 */

/** The password every sample user on the fake Jellyfin has. */
const PASSWORD = 'correct horse';

/** Fast typing: well inside the debounce, so a word is one question. */
const KEYSTROKE_DELAY = 40;

test.afterEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

/** Signs Rafael in and opens Search, which is where every test starts. */
async function openSearch(page: Page): Promise<void> {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');

  await page.getByRole('link', { name: 'Search' }).press('Enter');
  await expect(page.getByLabel('Search for a Movie or Series')).toBeVisible();
  // The screen opens on the typing, and every test here types: waiting for the
  // field to really have focus is what stops the first keystroke being lost to
  // whatever had it before.
  await expect.poll(() => focusedId(page)).toBe(FIELD_ID);
}

/** The id of whatever has focus, so the field can be told apart by name. */
function focusedId(page: Page): Promise<string | null> {
  return page.evaluate(() => document.activeElement?.id ?? null);
}

/** The field's own id, which the screen and the label agree on. */
const FIELD_ID = 'search-term';

function results(page: Page) {
  return page.getByRole('list', { name: 'Results' });
}

/** What focus is on, by the name a User would hear for it. */
function focused(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) return null;
    return active.getAttribute('aria-label') ?? active.textContent;
  });
}

test('the Titles that match appear as the User types', async ({ page }) => {
  await openSearch(page);

  // The field already has focus, so typing goes straight into it.
  await page.keyboard.type('he', { delay: KEYSTROKE_DELAY });

  await expect(results(page).locator('.card__name')).toHaveText(['Heat', 'The Unfinished']);

  // Narrowing the term narrows the results, without leaving the field.
  await page.keyboard.type('at', { delay: KEYSTROKE_DELAY });

  await expect(results(page).locator('.card__name')).toHaveText(['Heat']);
});

test('only Movies and Series are ever among the results', async ({ page }) => {
  await openSearch(page);

  // A stray video file in a Movies library, which the Server really does hold.
  await page.keyboard.type('Holiday', { delay: KEYSTROKE_DELAY });

  await expect(page.getByText('Nothing on this Server matches “Holiday”.')).toBeVisible();
  await expect(results(page)).toHaveCount(0);
});

test('the User is told plainly when nothing matches', async ({ page }) => {
  await openSearch(page);

  await page.keyboard.type('zzz', { delay: KEYSTROKE_DELAY });

  await expect(page.getByText('Nothing on this Server matches “zzz”.')).toBeVisible();
});

test('the flow is the field, then the results, and Enter opens one', async ({ page }) => {
  await openSearch(page);

  await page.keyboard.type('he', { delay: KEYSTROKE_DELAY });
  await expect(results(page).locator('.card__name')).toHaveText(['Heat', 'The Unfinished']);

  // Down leaves the field for the strip, at the card it offers to start on.
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => focused(page)).toBe('Heat');

  // And the strip is a line: Right takes the next result along.
  await page.keyboard.press('ArrowRight');
  expect(await focused(page)).toBe('The Unfinished');

  // Up goes back to the typing, so the term can be changed.
  await page.keyboard.press('ArrowUp');
  await expect.poll(() => focusedId(page)).toBe(FIELD_ID);

  await page.keyboard.press('ArrowDown');
  await expect.poll(() => focused(page)).toBe('The Unfinished');
  await page.keyboard.press('Enter');

  // Opening a result opens its title page, which is #17's to build, so for now
  // Enter has nowhere to go and Search must simply stay as it is.
  await expect(page).toHaveURL(/\/search$/);
  await expect(results(page)).toBeVisible();
  expect(await focused(page)).toBe('The Unfinished');
});

test('Left and Right stay the caret’s while the User is in the field', async ({ page }) => {
  await openSearch(page);

  await page.keyboard.type('he', { delay: KEYSTROKE_DELAY });
  await expect(results(page).locator('.card__name')).toHaveText(['Heat', 'The Unfinished']);

  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowRight');

  expect(await focusedId(page)).toBe(FIELD_ID);
});

test('a User who does not know what they want browses by genre', async ({ page }) => {
  await openSearch(page);

  const genres = page.getByRole('list', { name: 'Browse by genre' });
  await expect(genres.getByRole('button')).toHaveText([
    'Comedy',
    'Crime',
    'Drama',
    'Family',
    'Science Fiction',
    'Thriller',
  ]);

  // Down from the field reaches the genres, because nothing has been typed.
  await page.keyboard.press('ArrowDown');
  await expect.poll(() => focused(page)).toBe('Comedy');

  await genres.getByRole('button', { name: 'Family' }).press('Enter');

  // A Movie and a Series together, which is what a genre holds.
  await expect(page.getByRole('list', { name: 'Family' }).locator('.card__name')).toHaveText([
    'Bluey',
    'Paddington',
  ]);

  await page.getByRole('button', { name: 'All genres' }).press('Enter');

  await expect(genres).toBeVisible();
});
