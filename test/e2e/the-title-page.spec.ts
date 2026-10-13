import type { Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * The title page in a real browser: opening it from Home, opening its address
 * directly, Back closing it, My List from it, and the two shapes it takes — a
 * pop-up where there is a wide precise pointer, a full page on a phone and on a
 * TV.
 *
 * The shapes are what no unit test can see: happy-dom has no layout, so
 * `position: fixed` and a page that scrolls are only observable here. The
 * keyboard-only project drives the same journey with no pointer at all, which is
 * the point of story 70 — the remote reaches My List from this page, and from
 * nowhere else.
 */

/** The password every sample user on the fake Jellyfin has. */
const PASSWORD = 'correct horse';

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

/**
 * Opens Arrival's page from Home by pressing its card. Enter rather than a
 * click, because the keyboard-only project has no pointer at all.
 */
async function openArrivalFromHome(page: Page): Promise<void> {
  await page
    .getByRole('list', { name: 'New on Jellyflick' })
    .getByRole('listitem', { name: 'Arrival' })
    .press('Enter');
  await expect(page.getByRole('heading', { name: 'Arrival', level: 1 })).toBeVisible();
}

/** What focus is on, by the name a User would hear for it. */
function focused(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) return null;
    return active.getAttribute('aria-label') ?? active.textContent;
  });
}

test('opens from a card on Home, at an address of its own', async ({ page }) => {
  await signIn(page);

  await openArrivalFromHome(page);

  await expect(page).toHaveURL(/\/title\/movie-arrival$/);
  // Everything the page is for, in a laid-out browser.
  await expect(page.getByText('2016')).toBeVisible();
  await expect(page.getByText('PG-13')).toBeVisible();
  await expect(page.getByText('94% critics')).toBeVisible();
  await expect(page.getByText('7.9 from the community')).toBeVisible();
  await expect(page.getByText('English, French')).toBeVisible();
  await expect(page.getByText('Crime Classics')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  await expect(page.getByRole('list', { name: 'More like this' })).toBeVisible();
});

test('opens from its address, reloaded or shared', async ({ page }) => {
  await signIn(page);
  await openArrivalFromHome(page);

  // The container answers an unknown path with index.html and a 200, which is
  // what makes this work at all.
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Arrival', level: 1 })).toBeVisible();
  await expect(page.getByText('A linguist is asked to talk to the visitors.')).toBeVisible();
});

test('Back closes it and leaves Home as it was', async ({ page }) => {
  await signIn(page);
  await openArrivalFromHome(page);

  // The Back key, which is Escape on a keyboard, and which does nothing of its
  // own: it calls history.back(), the browser's own back button.
  await page.keyboard.press('Escape');

  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();
  // The title page itself is gone. Asserted on the page's own sheet rather
  // than on "no level-1 heading named Arrival": since #16 Home has a heading
  // of its own — the Billboard's featured Title — and Spotlight may well have
  // featured this one.
  await expect(page.locator('.title__sheet')).toHaveCount(0);
});

test('My List is reachable here with nothing but a remote', async ({ page }) => {
  await signIn(page);
  await openArrivalFromHome(page);

  // On a card in a Row this control is drawn only under the pointer, so this
  // page is the only way a remote reaches My List (story 70). Enter, not a
  // click: the keyboard-only project cannot click.
  const add = page.getByRole('button', { name: 'Add Arrival to My List' });
  await expect(add).toBeVisible();
  await add.press('Enter');

  await expect(page.getByRole('button', { name: 'Remove Arrival from My List' })).toBeVisible();

  // And the Server really holds it: Home's My List Row has it after Back.
  await page.keyboard.press('Escape');
  const row = page.getByRole('list', { name: 'My List' });
  await expect(row.locator('.card__name')).toHaveText(['Arrival']);
});

test('marks the Title watched, and tells the Server on the 12.x route', async ({
  page,
  request,
}) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);
  await signIn(page);
  await openArrivalFromHome(page);

  await page.getByRole('button', { name: 'Mark Arrival as watched' }).press('Enter');
  await expect(page.getByRole('button', { name: 'Mark Arrival as not watched' })).toBeVisible();

  const writes = (await (
    await request.get(`${FAKE_JELLYFIN_URL}/__fake/writes`)
  ).json()) as { method: string; path: string }[];
  expect(
    writes
      .filter((write) => write.path.startsWith('/UserPlayedItems/'))
      .map((write) => [write.method, write.path]),
  ).toEqual([['POST', '/UserPlayedItems/movie-arrival']]);

  // And the Server holds it: the page reads it again from scratch.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Mark Arrival as not watched' })).toBeVisible();
});

test('More like this opens another title page, and Back steps back through them', async ({
  page,
}) => {
  await signIn(page);
  await openArrivalFromHome(page);

  const similar = page.getByRole('list', { name: 'More like this' });
  await expect(similar.locator('.card__name')).toHaveText(['Severance', 'Heat']);

  await similar.getByRole('listitem', { name: 'Heat' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Heat', level: 1 })).toBeVisible();
  await expect(page).toHaveURL(/\/title\/movie-heat$/);

  await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Arrival', level: 1 })).toBeVisible();
});

test('says so for an address that is not a Title the app shows', async ({ page }) => {
  await signIn(page);

  // The "only Movies and Series" rule lives in the gateway, so this is the
  // Server answering with nothing rather than a screen filtering.
  await page.goto('/title/album-nocturnes');

  await expect(
    page.getByText('Only Movies and Series have a page of their own.', { exact: false }),
  ).toBeVisible();
});

test.describe('the shape it takes', () => {
  test('is a pop-up where there is a wide pointer', async ({ page, browserName }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop',
      'the pop-up is for a wide screen with a precise pointer',
    );
    expect(browserName).toBe('chromium');

    await signIn(page);
    await openArrivalFromHome(page);

    const sheet = page.locator('.title');
    // Fixed to the screen, which is what makes the arrow keys treat it as the
    // flow (`spatial-navigation.ts`) rather than stepping out to the bar behind.
    expect(await sheet.evaluate((el) => window.getComputedStyle(el).position)).toBe('fixed');
  });

  test('is a full page on a phone', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'phone', 'this is the phone layout');

    await signIn(page);
    await openArrivalFromHome(page);

    const sheet = page.locator('.title');
    expect(await sheet.evaluate((el) => window.getComputedStyle(el).position)).not.toBe('fixed');
    // And it is still driveable: the page's own flow reaches the actions.
    await expect(page.getByRole('button', { name: 'Play' })).toBeVisible();
  });
});

test('is driveable with nothing but the arrow keys', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'keyboard-only', 'this is the remote’s journey');

  await signIn(page);
  await openArrivalFromHome(page);

  // In from nothing focused: the first presses enter the page rather than
  // stepping out of whatever the card that opened it happened to be.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  });
  for (let press = 0; press < 6 && (await focused(page)) !== 'Play'; press += 1) {
    await page.keyboard.press('ArrowDown');
  }
  expect(await focused(page)).toBe('Play');

  // And the actions are a line: Right takes the next one along.
  await page.keyboard.press('ArrowRight');
  expect(await focused(page)).toBe('Add Arrival to My List');
});
