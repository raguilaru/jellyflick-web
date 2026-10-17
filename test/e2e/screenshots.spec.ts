import type { Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Takes a picture of every screen at desktop size, for a README, a changelog
 * entry, or an eye over a change nobody can describe in an assertion.
 *
 * This proves nothing — it is a tour, not a test — so it stays out of the
 * suite's way: `npm run test:e2e` skips it, and it is asked for by name.
 *
 *   npm run screenshots
 *
 * The files land in `screenshots/`, which git ignores. A
 * failure here is a broken tour, never a broken app, so nothing on CI should
 * ever wait on it.
 */

/** The password every sample user on the fake Jellyfin has. */
const PASSWORD = 'correct horse';

/**
 * Not under `test-results/`: Playwright empties that directory at the start of
 * every run, so the next ordinary `npm run test:e2e` would throw the tour away.
 */
const INTO = 'screenshots';

test.describe('the app at desktop size', () => {
  test.afterEach(async ({ request }) => {
    await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
  });

  test('tour', async ({ page }, testInfo) => {
    test.skip(
      testInfo.project.name !== 'desktop' || process.env.SCREENSHOTS === undefined,
      'the tour is of the desktop layout, and only runs when it is asked for',
    );
    // Generous: a dozen screens in one test, on a build still warming up.
    test.setTimeout(120_000);

    const shot = async (name: string, options: { full?: boolean } = {}): Promise<void> => {
      await page.screenshot({
        path: `${INTO}/${name}.png`,
        animations: 'disabled',
        fullPage: options.full ?? false,
      });
    };

    // The fake Jellyfin answers an image URL with JSON — it is built for
    // assertions about URLs, not pixels — so a shot of it would be a wall of
    // broken-image icons. Stand-in artwork is drawn here instead, so these
    // pictures show the layout the artwork actually makes.
    await standInArtwork(page);

    // 1. Finding the Server, which is where the app opens with no preset.
    await openApp(page);
    await expect(page.getByLabel(/address/i)).toBeVisible();
    await shot('01-connect-to-a-server');

    // 2. Who is watching.
    await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
    await expect(page.getByRole('button', { name: 'Rafael' })).toBeVisible();
    await shot('02-who-is-watching');

    // 3. The password.
    await page.getByRole('button', { name: 'Rafael' }).press('Enter');
    await expect(page.getByLabel('Password')).toBeVisible();
    await shot('03-signing-in');

    // 4. Home, once the Rows have really arrived.
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByLabel('Password').press('Enter');
    await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();
    await settled(page);
    await shot('04-home');
    await shot('04-home-full', { full: true });

    // 5. A Title's page, as the pop-up a wide screen gets.
    await page
      .getByRole('list', { name: 'New on Jellyflick' })
      .getByRole('listitem', { name: 'Arrival' })
      .press('Enter');
    await expect(page.getByRole('heading', { name: 'Arrival', level: 1 })).toBeVisible();
    await settled(page);
    await shot('05-a-title-page');

    // Into My List, so the picture of that section further down is of a
    // section with something in it rather than of its empty state.
    await page.getByRole('button', { name: 'Add Arrival to My List' }).press('Enter');
    await expect(page.getByRole('button', { name: 'Remove Arrival from My List' })).toBeVisible();

    // 6. Playing it, with the controls up.
    await page.getByRole('button', { name: 'Play', exact: true }).press('Enter');
    await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();
    // A beat of real decoding, so the frame underneath the controls is a
    // picture rather than the black the video opens on.
    await expect
      .poll(() => page.evaluate(() => document.querySelector('video')?.currentTime ?? 0))
      .toBeGreaterThan(1);
    // Controls fade out on their own; a nudge brings them back for the shot.
    await page.mouse.move(640, 400);
    await shot('06-playing-a-title');
    await page.keyboard.press('Escape');

    // 7. Search, with something typed.
    await page.goto('/search');
    await page.getByLabel('Search for a Movie or Series').fill('a');
    await expect(page.getByRole('list', { name: 'Results' })).toBeVisible();
    await settled(page);
    await shot('07-search', { full: true });

    // 8. Movies, which is still the placeholder every unbuilt section shows.
    await page.goto('/movies');
    await settled(page);
    await shot('08-movies', { full: true });

    // 9. My List, holding what was added from the title page.
    await page.goto('/my-list');
    await expect(page.getByRole('heading', { name: 'My List', level: 1 })).toBeVisible();
    await settled(page);
    await shot('09-my-list', { full: true });

    // 10. Settings, and the Home layout under it.
    await page.goto('/settings');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await settled(page);
    await shot('10-settings', { full: true });

    await page.goto('/settings/home-layout');
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    await settled(page);
    await shot('11-the-home-layout', { full: true });
  });
});

/**
 * Serves a flat gradient wherever the app asks for artwork or a User's
 * picture. The colour is taken from the URL, so the same Title is the same
 * colour in every picture and between runs.
 */
async function standInArtwork(page: Page): Promise<void> {
  // One shape per `ImageType`, because a Logo stretched to a poster's shape
  // would wreck the very layout these pictures are of.
  const shapes: Record<string, [number, number]> = {
    Primary: [640, 960],
    Backdrop: [1280, 720],
    Thumb: [1280, 720],
    Logo: [800, 240],
  };

  const draw = (url: string): string => {
    const imageType = /\/Images\/([A-Za-z]+)/.exec(url)?.[1] ?? 'Primary';
    const [width, height] = shapes[imageType] ?? shapes.Primary!;
    let hash = 0;
    for (const character of url) hash = (hash * 31 + character.codePointAt(0)!) % 360;
    // A Logo sits over artwork, so it is drawn as a mark on nothing rather
    // than as a filled rectangle.
    const fill =
      imageType === 'Logo'
        ? `<rect x="40" y="80" width="${String(width - 80)}" height="80" rx="12" fill="hsl(${String(hash)} 60% 80%)" opacity="0.9"/>`
        : `<rect width="${String(width)}" height="${String(height)}" fill="url(#g)"/>`;
    return [
      `<svg xmlns="http://www.w3.org/2000/svg" width="${String(width)}" height="${String(height)}" viewBox="0 0 ${String(width)} ${String(height)}">`,
      '<defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1">',
      `<stop offset="0" stop-color="hsl(${String(hash)} 45% 38%)"/>`,
      `<stop offset="1" stop-color="hsl(${String((hash + 40) % 360)} 50% 14%)"/>`,
      '</linearGradient></defs>',
      fill,
      '</svg>',
    ].join('');
  };

  const serve = (url: string) => ({
    status: 200,
    contentType: 'image/svg+xml',
    body: draw(url),
  });
  await page.route('**/Items/*/Images/**', (route) => route.fulfill(serve(route.request().url())));
  await page.route('**/UserImage*', (route) => route.fulfill(serve(route.request().url())));
}

/**
 * Waits for the artwork to be decoded and the fonts to be swapped in, so a
 * picture is never of a screen half built.
 */
async function settled(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      [...document.images].filter((image) => !image.complete).map(
        (image) =>
          new Promise((resolve) => {
            image.addEventListener('load', resolve, { once: true });
            image.addEventListener('error', resolve, { once: true });
          }),
      ),
    );
  });
}
