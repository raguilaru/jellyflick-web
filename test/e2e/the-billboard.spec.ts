import type { Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/** The password every sample user on the fake Jellyfin has. */
const PASSWORD = 'correct horse';

/**
 * The Billboard at the top of Home, in a real browser against a production
 * build (#16, stories 22 to 33).
 *
 * **The pick is made deterministic through the library, not through the
 * randomness.** In a browser the draw really is `Math.random()` — that is the
 * point of the device layer — so instead each test leaves exactly one Title
 * eligible by marking the others watched. Spotlight prefers what the User has
 * not finished, so the pool is one Title and the draw cannot matter. Which
 * Title a given draw picks out of several is `test/unit/spotlight.test.ts`,
 * where the draw is fixed.
 *
 * Of the three sample Titles with a backdrop: Arrival and Severance have a logo
 * and a local trailer, and Paddington has neither.
 */

test.afterEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

/** Leaves one Title the only unfinished one with a backdrop, so it is featured. */
async function featureOnly(
  request: { post: (url: string, options: { data: unknown }) => Promise<unknown> },
  keep: 'movie-arrival' | 'movie-paddington' | 'series-severance',
): Promise<void> {
  const withBackdrops = ['movie-arrival', 'movie-paddington', 'series-severance'];
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
    data: { played: { 'user-rafael': withBackdrops.filter((id) => id !== keep) } },
  });
}

async function signIn(page: Page): Promise<void> {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
}

/** The Billboard, which names itself as a region rather than by a heading. */
function billboard(page: Page) {
  return page.getByRole('region', { name: 'Featured' });
}

/**
 * Opens the settings screen the way this viewport offers it: a wide screen's
 * top bar carries its own link, and a phone's bottom bar reaches it through the
 * User picture, because its fourth item is who is watching. The same two ways
 * `test/e2e/settings.spec.ts` sets out.
 */
async function openSettings(page: Page): Promise<void> {
  const topBar = page.locator('.top-bar');
  if ((await topBar.count()) > 0) {
    await topBar.getByRole('link', { name: 'Settings' }).press('Enter');
  } else {
    await page.locator('.bottom-bar__user').press('Enter');
    await page.locator('.user-picker').getByRole('link', { name: 'Settings' }).press('Enter');
  }
  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
}

/**
 * **#56's assertion: every control in a row measured by its own right edge
 * against the width of the screen it is drawn on.**
 *
 * This is deliberately *not* `document.documentElement.scrollWidth >
 * clientWidth`, which is the shape this project adopted after #44 as the one
 * thing scrolling cannot paper over. **It is blind here**, and #34 confirmed
 * that experimentally while writing `play-on.spec.ts`: a control clipped by the
 * edge of the screen **does not lengthen the document**, so the scroll width
 * stays exactly equal to the client width. On the tip this ticket was filed
 * against, "Pause the trailer" ended at x=393.23 on a 390px viewport while
 * `scrollWidth` and `clientWidth` were both 390.
 *
 * Every other assertion in this file is blind too, for the reason recorded
 * against #44: **Playwright scrolls an element into view before touching it**,
 * so the presses in `the local trailer plays by itself…` above pass whether the
 * button is on the screen or off the side of it. The own-right-edge loop is the
 * only assertion that sees it, which is why it is copied from
 * `play-on.spec.ts` rather than reinvented.
 *
 * The count is asserted first on purpose. A loop over nothing passes, and #57
 * has just found one of those in `styled-subtitles.spec.ts` — a test that was
 * green with the renderer entirely removed. A measurement of zero controls
 * would be exactly that.
 */
async function expectEveryControlOnTheScreen(page: Page, selector: string): Promise<void> {
  const viewport = page.viewportSize();
  if (viewport === null) throw new Error('No viewport to measure against.');

  const controls = page.locator(selector).locator('a, button');
  const count = await controls.count();
  expect(count, `${selector} has no controls to measure`).toBeGreaterThan(0);

  for (let index = 0; index < count; index += 1) {
    const control = controls.nth(index);
    const box = await control.boundingBox();
    const name = ((await control.textContent()) ?? '?').trim();
    // Thrown rather than skipped past: a control with no box is one this loop
    // cannot see, which is the failure it exists to catch and not a pass.
    if (box === null) throw new Error(`“${name}” in ${selector} has no box to measure.`);

    expect(
      box.x,
      `“${name}” starts off the left of the ${String(viewport.width)}px screen`,
    ).toBeGreaterThanOrEqual(0);
    expect(
      box.x + box.width,
      `“${name}” runs off the right of the ${String(viewport.width)}px screen`,
    ).toBeLessThanOrEqual(viewport.width);
  }
}

/** Back to Home through whichever navigation bar this viewport has. */
async function goHome(page: Page): Promise<void> {
  const bar = (await page.locator('.top-bar').count()) > 0 ? '.top-bar' : '.bottom-bar';
  await page.locator(bar).getByRole('link', { name: 'Home' }).press('Enter');
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
}

test('a User landing on Home is offered one Title, with its backdrop and logo', async ({
  page,
  request,
}) => {
  await featureOnly(request, 'movie-arrival');

  await signIn(page);

  const board = billboard(page);
  await expect(board).toBeVisible();
  // The logo stands in for the heading, and still names the Title.
  await expect(board.locator('.billboard__logo')).toHaveAttribute(
    'src',
    `${FAKE_JELLYFIN_URL}/Items/movie-arrival/Images/Logo?tag=tag-arrival-logo&maxWidth=600`,
  );
  await expect(board.locator('.billboard__logo')).toHaveAttribute('alt', 'Arrival');
  await expect(board.locator('.billboard__backdrop')).toHaveAttribute(
    'src',
    `${FAKE_JELLYFIN_URL}/Items/movie-arrival/Images/Backdrop?tag=tag-arrival-backdrop&maxWidth=1920`,
  );
  await expect(board).toContainText('A linguist is asked to talk to the visitors.');
  await expect(board).toContainText('PG-13');
});

test('the Billboard really fills the top of the window', async ({ page, request }) => {
  await featureOnly(request, 'movie-arrival');

  await signIn(page);

  // What only a browser can say: the backdrop bleeds to both edges, and the
  // Billboard is the first thing on Home rather than something below the Rows.
  const board = billboard(page);
  const box = await board.boundingBox();
  const viewport = page.viewportSize();
  if (box === null || viewport === null) throw new Error('No layout.');

  expect(box.x).toBeLessThanOrEqual(1);
  expect(Math.abs(box.width - viewport.width)).toBeLessThanOrEqual(1);
  expect(box.y).toBeLessThan(viewport.height / 2);
  // Taller than a Row's card, which is what "larger than the Rows" means.
  expect(box.height).toBeGreaterThan(300);
});

test('a Title with no logo is headed by its name in the logo font', async ({ page, request }) => {
  await featureOnly(request, 'movie-paddington');

  await signIn(page);

  const name = billboard(page).locator('.billboard__name');
  await expect(name).toHaveText('Paddington');
  await expect(billboard(page).locator('.billboard__logo')).toHaveCount(0);
  // The wordmark's own face, which is what makes it read as artwork. Asserted
  // through the computed style, because the fallback stack is the thing that
  // would silently be used if the face had not loaded.
  const family = await name.evaluate((element) => getComputedStyle(element).fontFamily);
  expect(family).toContain('Bebas Neue');
});

test('More info opens the featured Title’s own page', async ({ page, request }) => {
  await featureOnly(request, 'movie-arrival');
  await signIn(page);

  await billboard(page).locator('.billboard__more-info').press('Enter');

  await expect(page).toHaveURL(/\/title\/movie-arrival$/);
  await expect(page.getByRole('heading', { level: 1, name: 'Arrival' })).toBeVisible();
});

test('the same Title is still featured on coming back from its title page', async ({
  page,
  request,
}) => {
  // Story 31, and the reason the pick is held above the router. Two Titles are
  // eligible here, so a re-pick really could land on the other one — and with a
  // real `Math.random()` it eventually would.
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
    data: { played: { 'user-rafael': ['movie-paddington'] } },
  });
  await signIn(page);

  const featured = await billboard(page).locator('.billboard__title').innerHTML();
  await billboard(page).locator('.billboard__more-info').press('Enter');
  await expect(page).toHaveURL(/\/title\//);

  await page.goBack();

  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
  await expect(billboard(page).locator('.billboard__title')).toHaveCount(1);
  expect(await billboard(page).locator('.billboard__title').innerHTML()).toBe(featured);
});

test('the local trailer plays by itself, muted, and can be unmuted and paused', async ({
  page,
  request,
}) => {
  await featureOnly(request, 'movie-arrival');

  await signIn(page);

  // It starts after a short delay, so it is waited for rather than expected at
  // once (stories 24 and 25).
  const trailer = billboard(page).locator('.billboard__trailer');
  await expect(trailer).toHaveCount(1);
  await expect(trailer).toHaveJSProperty('muted', true);
  // The trailer's own item, negotiated like any other playback.
  await expect(trailer).toHaveAttribute('src', /trailer-arrival/);
  // Really playing, which only a browser can say.
  await expect
    .poll(async () => await trailer.evaluate((video: HTMLVideoElement) => video.paused))
    .toBe(false);

  await page.getByRole('button', { name: 'Unmute the trailer' }).press('Enter');
  await expect(trailer).toHaveJSProperty('muted', false);

  await page.getByRole('button', { name: 'Pause the trailer' }).press('Enter');
  await expect(trailer).toHaveJSProperty('paused', true);
  await expect(page.getByRole('button', { name: 'Play the trailer' })).toBeVisible();
});

/**
 * **#56: the Billboard's two rows of controls fit the screen they are drawn
 * on.** Both rows are measured, not only the trailer's, because they are the
 * same shape of mistake: a single row of `max-content` columns is as wide as
 * its contents whatever the screen is, and #44 shipped exactly that as a 635px
 * sheet on a 375px screen with every end-to-end assertion green.
 *
 * Play and More info happened to fit in English when #56 was filed. That is not
 * the same claim as that they fit, which is why they are measured here rather
 * than taken on trust — and the Spanish run below is where it stops being a
 * coincidence worth relying on.
 */
test('the Billboard’s rows of controls fit the screen they are drawn on', async ({
  page,
  request,
}) => {
  await featureOnly(request, 'movie-arrival');
  await signIn(page);

  // Play and More info are there to be measured.
  await expect(billboard(page).locator('.billboard__play')).toBeVisible();
  await expectEveryControlOnTheScreen(page, '.billboard__actions');

  // The trailer's row arrives after the delay, so it is waited for — and the
  // wait is what makes the loop below a measurement of controls that exist
  // rather than #33's trap of a row that was never drawn.
  await expect(page.getByRole('button', { name: 'Unmute the trailer' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Pause the trailer' })).toBeVisible();
  await expectEveryControlOnTheScreen(page, '.billboard__trailer-controls');
});

/**
 * **The same measurement in Spanish**, which #56 asks for because the figures
 * on the issue are English and `src/i18n/es.ts` is longer almost everywhere:
 * "Unmute the trailer" is "Activar el sonido del tráiler", and "More info" is
 * "Más información". A row that fits English by three pixels is not a row that
 * fits.
 *
 * The locale is the browser context's, not a press on the settings screen, so
 * this is the default path story 113 describes — `device.preferredLanguages()`
 * reading `navigator.languages`, which is what Playwright's `locale` sets.
 */
test.describe('in Spanish', () => {
  test.use({ locale: 'es-ES' });

  /** The same sign-in, in the language the device asked for. */
  async function signInEnEspanol(page: Page): Promise<void> {
    await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
    await page.getByRole('button', { name: 'Rafael' }).press('Enter');
    await page.getByLabel('Contraseña').fill(PASSWORD);
    await page.getByLabel('Contraseña').press('Enter');
    await expect(page.getByText('Sesión iniciada como Rafael.')).toBeVisible();
  }

  test('the Billboard’s rows of controls fit the screen in Spanish too', async ({
    page,
    request,
  }) => {
    await featureOnly(request, 'movie-arrival');
    await signInEnEspanol(page);

    // The Spanish dictionary really arrived, so what is measured below is the
    // longer labels and not English ones under a Spanish `lang`.
    await expect(page.getByRole('button', { name: 'Más información' })).toBeVisible();
    await expectEveryControlOnTheScreen(page, '.billboard__actions');

    await expect(
      page.getByRole('button', { name: 'Activar el sonido del tráiler' }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: 'Pausar el tráiler' })).toBeVisible();
    await expectEveryControlOnTheScreen(page, '.billboard__trailer-controls');
  });
});

test('a Title with no trailer shows its backdrop and no player at all', async ({
  page,
  request,
}) => {
  // Story 25: Paddington has no local trailer beside it.
  await featureOnly(request, 'movie-paddington');

  await signIn(page);
  await expect(billboard(page).locator('.billboard__backdrop')).toBeVisible();

  // Nothing appears once the delay has passed either.
  await page.waitForTimeout(2000);
  await expect(billboard(page).locator('.billboard__trailer')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Unmute the trailer' })).toHaveCount(0);
});

test('a User who turns Billboard trailer autoplay off stops getting one', async ({
  page,
  request,
}) => {
  await featureOnly(request, 'movie-arrival');
  await signIn(page);
  // The trailer is there to begin with, so the setting is what changes it.
  await expect(billboard(page).locator('.billboard__trailer')).toHaveCount(1);

  await openSettings(page);
  await page.getByRole('button', { name: 'Just show the backdrop' }).press('Enter');
  await expect(
    page.getByRole('button', { name: 'Just show the backdrop', pressed: true }),
  ).toBeVisible();

  await goHome(page);

  await expect(billboard(page).locator('.billboard__backdrop')).toBeVisible();
  await page.waitForTimeout(2000);
  await expect(billboard(page).locator('.billboard__trailer')).toHaveCount(0);
});

test('Home says what is the case when the Server will not say what to feature', async ({
  page,
  request,
}) => {
  await signIn(page);
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
    data: { failLibraryQueriesWith: 500 },
  });
  await page.reload();

  await expect(
    page.getByRole('alert').filter({
      hasText: 'Jellyflick could not read a Title to feature from the Server.',
    }),
  ).toBeVisible();
});
