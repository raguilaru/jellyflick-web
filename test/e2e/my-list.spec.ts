import type { Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Adding to and removing from My List in a real browser: the two things no unit
 * test can see, because happy-dom has no layout and no pointer.
 *
 * On a Row's card the toggle is revealed by hover, so the adding half runs
 * wherever there is a pointer. On the My List page the toggle is always drawn
 * and is a focus stop, so the removing half runs with nothing but the arrow
 * keys — including in the keyboard-only project, where every pointer
 * interaction is made impossible.
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

/** Puts Titles in Rafael's My List before the app reads it. */
async function givenMyListHolds(
  request: { post(url: string, options: { data: unknown }): Promise<unknown> },
  itemIds: readonly string[],
): Promise<void> {
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
    data: { favourites: { 'user-rafael': itemIds } },
  });
}

/**
 * Opens the My List page from the navigation bar. Pressing Enter on the link
 * rather than clicking it, because the keyboard-only project has no pointer.
 */
async function openMyList(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'My List' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'My List', level: 1 })).toBeVisible();
}

/** Whether focus is on something inside the page's grid of Titles. */
function focusIsInTheGrid(page: Page): Promise<boolean> {
  return page.evaluate(() => document.activeElement?.closest('.grid') !== null);
}

/** What focus is on, by the name a User would hear for it. */
function focused(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const active = document.activeElement;
    if (active === null || active === document.body) return null;
    return active.getAttribute('aria-label') ?? active.textContent;
  });
}

test.describe('with a pointer', () => {
  test.skip(({ keyboardOnly }) => keyboardOnly, 'a card’s toggle is revealed by hover');

  test('a Title added from a card on Home appears in the My List Row and on its page', async ({
    page,
  }) => {
    await signIn(page);
    // Nothing in the list, so no Row for it yet.
    await expect(page.getByRole('list', { name: 'My List' })).toHaveCount(0);

    const card = page
      .getByRole('list', { name: 'New on Jellyflick' })
      .getByRole('listitem', { name: 'Arrival' });

    // The toggle is not there until the pointer is over the card: a control the
    // arrow keys would have to step through would break the Row's line.
    await expect(card.getByRole('button')).toBeHidden();
    await card.hover();
    await card.getByRole('button', { name: 'Add Arrival to My List' }).click();

    const row = page.getByRole('list', { name: 'My List' });
    await expect(row.locator('.card__name')).toHaveText(['Arrival']);

    /*
     * The same card now offers the other half of the toggle, without a reload.
     *
     * Hovered again first, and that is the point rather than belt-and-braces:
     * the control is drawn only while the pointer is over the card
     * (`.card:hover > .card__control`), and the press above has just put a
     * whole new Row on Home **above** this one — My List comes before New on
     * Jellyflick in the default Home Layout. The card slides down out from
     * under a pointer that has not moved, `:hover` stops matching, and the
     * button leaves the page entirely. Whether that happened before or after
     * this assertion was a race, and it is what made this test fail in two CI
     * runs out of five. Retried, because the Billboard's artwork can land
     * later still and shift the page a second time.
     */
    await expect(async () => {
      await card.hover();
      await expect(card.getByRole('button', { name: 'Remove Arrival from My List' })).toBeVisible({
        timeout: 1_000,
      });
    }).toPass({ timeout: 15_000 });

    // And the Server really holds it: the page reads the list afresh.
    await openMyList(page);
    await expect(page.getByRole('list', { name: 'My List' }).locator('.card__name')).toHaveText([
      'Arrival',
    ]);
  });

  test('the Server is told, with the 12.x favourite route', async ({ page, request }) => {
    await request.delete(`${FAKE_JELLYFIN_URL}/__fake/writes`);
    await signIn(page);

    const card = page
      .getByRole('list', { name: 'New on Jellyflick' })
      .getByRole('listitem', { name: 'Heat' });
    await card.hover();
    await card.getByRole('button', { name: 'Add Heat to My List' }).click();
    await expect(page.getByRole('list', { name: 'My List' })).toBeVisible();

    const writes = (await (
      await request.get(`${FAKE_JELLYFIN_URL}/__fake/writes`)
    ).json()) as { method: string; path: string }[];
    // Signing in is a write too, so only the favourite route is of interest.
    expect(
      writes
        .filter((write) => write.path.startsWith('/UserFavoriteItems/'))
        .map((write) => [write.method, write.path]),
    ).toEqual([['POST', '/UserFavoriteItems/movie-heat']]);
  });
});

test.describe('the My List page', () => {
  test('shows the whole list as a grid of Titles', async ({ page, request }) => {
    await givenMyListHolds(request, ['movie-heat', 'series-bluey', 'movie-arrival']);
    await signIn(page);

    await openMyList(page);

    const grid = page.getByRole('list', { name: 'My List' });
    await expect(grid.locator('.card__name')).toHaveText(['Arrival', 'Bluey', 'Heat']);
    // A grid, not a strip: it wraps down the page rather than scrolling sideways.
    expect(await grid.evaluate((element) => window.getComputedStyle(element).display)).toBe('grid');
    expect(
      await grid.evaluate((element) => element.scrollWidth - element.clientWidth),
    ).toBe(0);
  });

  test('is driveable, and a Title removable, with nothing but the arrow keys', async ({
    page,
    request,
  }) => {
    await givenMyListHolds(request, ['movie-heat', 'movie-arrival']);
    await signIn(page);
    await openMyList(page);
    await expect(page.getByRole('list', { name: 'My List' })).toBeVisible();

    const grid = page.getByRole('list', { name: 'My List' });

    // In from the edge of the screen, with nothing focused: the first press
    // enters the page rather than stepping out from wherever the navigation
    // link that opened it happened to be. How many presses it takes to get past
    // the navigation is a matter of layout, so this presses until it is in the
    // grid rather than assuming a number.
    await page.evaluate(() => {
      (document.activeElement as HTMLElement | null)?.blur();
    });
    for (let press = 0; press < 5 && !(await focusIsInTheGrid(page)); press += 1) {
      await page.keyboard.press('ArrowDown');
    }
    expect(await focusIsInTheGrid(page)).toBe(true);

    // A card's own control is one press to its right, so a remote reaches the
    // thing this page exists for.
    await grid.getByRole('listitem', { name: 'Heat' }).focus();
    await page.keyboard.press('ArrowRight');
    expect(await focused(page)).toBe('Remove Heat from My List');

    await page.keyboard.press('Enter');

    // Gone at once, and gone from the Server too.
    await expect(page.getByRole('list', { name: 'My List' }).locator('.card__name')).toHaveText([
      'Arrival',
    ]);
    await page.reload();
    await expect(page.getByRole('list', { name: 'My List' }).locator('.card__name')).toHaveText([
      'Arrival',
    ]);
  });

  test('says there is nothing in My List rather than showing an empty grid', async ({ page }) => {
    await signIn(page);

    await openMyList(page);

    await expect(
      page.getByText('Nothing is in My List yet. Add a Title from any Row to find it here.'),
    ).toBeVisible();
    await expect(page.getByRole('list', { name: 'My List' })).toHaveCount(0);
  });
});
