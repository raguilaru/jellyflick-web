import type { Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * The Movies and Series sections in a real browser (#23, AC 3).
 *
 * What only a laid-out page can say: that each section is at its own address
 * and says which it is, that its Rows hold one kind of Title, that the genre
 * Rows the library earned are really drawn, and that none of it runs off the
 * side of a 375px screen.
 *
 * **A screen is told from another by its address**, never by a heading: the
 * Billboard draws the featured Title's name as a heading on Home and in both
 * of these sections alike, and two tests have already been fooled by it.
 */

/** The password every sample user on the fake Jellyfin has. */
const PASSWORD = 'correct horse';

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
 * Signs in and walks into a section through the navigation, as a User does.
 *
 * Every project has a link to press as of #51: the top bar carries both on a
 * wide screen, and Home carries the pair at phone width, where the bottom bar
 * has four items and neither is among them (story 61).
 */
async function openSection(page: Page, name: 'Movies' | 'Series') {
  await signIn(page);
  await followLinkTo(page, name);
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}

/**
 * Crosses from one of the two sections to the other, the way a User does at
 * this width. A wide screen's bar carries both links from every screen; at
 * phone width the pair lives **on Home** (#51), so the hop goes back through
 * it — which is the honest phone journey rather than a shape of the test's.
 */
async function crossToSection(
  page: Page,
  name: 'Movies' | 'Series',
  testInfo: { project: { name: string } },
) {
  if (testInfo.project.name === 'phone') {
    // `exact`, or "Home" also matches Home's own Edit Home link.
    await page.getByRole('link', { name: 'Home', exact: true }).press('Enter');
    await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
  }
  await followLinkTo(page, name);
}

async function followLinkTo(page: Page, name: 'Movies' | 'Series') {
  await page.getByRole('link', { name, exact: true }).press('Enter');
  await expect(page).toHaveURL(new RegExp(`/${name.toLowerCase()}$`));
}

test('the Movies section holds the Movies, and the Series section the Series', async ({
  page,
}, testInfo) => {
  await openSection(page, 'Movies');
  await expect(
    page.getByRole('list', { name: 'New on Jellyflick' }).locator('.card__name'),
  ).toHaveText(['Paddington', 'Arrival', 'Heat', 'The Unfinished']);

  await crossToSection(page, 'Series', testInfo);
  // Each Series once and by the Series, however many Episodes arrived.
  await expect(
    page.getByRole('list', { name: 'New on Jellyflick' }).locator('.card__name'),
  ).toHaveText(['Bluey', 'Severance']);
});

test('each section is headed by the genres its own library earned', async ({
  page,
}, testInfo) => {
  await openSection(page, 'Movies');
  // Three of the four sample Movies are Drama; the rest are in one genre
  // each, so the two behind it are the first two by name.
  await expect(page.locator('.row__heading')).toHaveText([
    'New on Jellyflick',
    'Drama',
    'Comedy',
    'Crime',
  ]);
  await expect(page.getByRole('list', { name: 'Drama' }).locator('.card__name')).toHaveText([
    'Arrival',
    'Heat',
    'The Unfinished',
  ]);

  await crossToSection(page, 'Series', testInfo);
  // Bluey and Severance share no genre, so all five tie and the first three
  // by name win. The Movies' Crime Row is gone, which is the point.
  await expect(page.locator('.row__heading')).toHaveText([
    'New on Jellyflick',
    'Comedy',
    'Drama',
    'Family',
  ]);
});

test('the section names the page and the Billboard names a Title under it', async ({
  page,
}) => {
  await openSection(page, 'Movies');
  await expect(page.locator('.billboard__title')).toBeVisible();

  // One answer to "what page is this": the section's. The Billboard's own
  // heading sits a level under it, which is the opposite of Home.
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(['Movies']);
});

test('a section opened at its own address draws itself', async ({ page }) => {
  await signIn(page);

  // A section is a real address, so it can be bookmarked, shared and reloaded.
  await page.goto('/series');
  await expect(page.getByRole('heading', { name: 'Series', level: 1 })).toBeVisible();
  await expect(
    page.getByRole('list', { name: 'New on Jellyflick' }).locator('.card__name'),
  ).toHaveText(['Bluey', 'Severance']);
});

/**
 * Both ends of the phone journey, in one test rather than two, because they
 * ask the same question and a second runtime skip would move the suite's skip
 * count for a measurement rather than for a gap.
 */
test('[phone] the way into a section, and the section, fit a 375px screen', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'this is the question the phone project asks');

  await page.setViewportSize({ width: 375, height: 812 });
  await signIn(page);

  // Home's pair of section links is the way in at this width (#51), and a row
  // of choices on the narrowest screen is exactly the shape that overflows.
  await expect(page.getByRole('link', { name: 'Movies', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Series', exact: true })).toBeVisible();
  expect(await widthOf(page)).toMatchObject({ overflowing: false });

  await page.goto('/movies');
  await expect(page.getByRole('heading', { name: 'Movies', level: 1 })).toBeVisible();
  // The genre Rows arrive after the fixed ones, so the measurement waits for
  // the tallest the page gets rather than for the first thing drawn.
  await expect(page.locator('.row__heading')).toHaveCount(4);
  expect(await widthOf(page)).toMatchObject({ overflowing: false });
});

/**
 * The one assertion scrolling cannot paper over: Playwright scrolls an element
 * into view before looking at it, so every other check passes over a layout
 * that runs off the side of the screen (#44, #35, #20).
 *
 * Both widths are returned beside the verdict so a failure says by how much
 * rather than only that it happened.
 */
function widthOf(page: Page): Promise<{ scroll: number; client: number; overflowing: boolean }> {
  return page.evaluate(() => {
    const { scrollWidth, clientWidth } = document.documentElement;
    return { scroll: scrollWidth, client: clientWidth, overflowing: scrollWidth > clientWidth };
  });
}

test('a card in a section opens that Title’s page', async ({ page }) => {
  await signIn(page);
  await page.goto('/movies');
  await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();

  await page
    .getByRole('list', { name: 'New on Jellyflick' })
    .getByRole('listitem', { name: 'Arrival' })
    .press('Enter');

  // The address, not a heading: the Billboard draws a Title's name as a
  // heading on the section behind this page too.
  await expect(page).toHaveURL(/\/title\/movie-arrival$/);
});
