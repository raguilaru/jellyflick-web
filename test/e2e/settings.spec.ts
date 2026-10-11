import type { APIRequestContext, Browser, Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * The settings screen in a browser (#11, stories 112, 113 and 49): the Accent
 * Colour painting the app, the language switching, and both of them following
 * the User to another device.
 *
 * "Another device" is a second browser context: its own storage, its own
 * sign-in, its own DeviceId and token. Nothing of the first one's reaches it,
 * so a setting that shows up there came from the Server and nowhere else.
 *
 * Every press here is a key press rather than a click, so these journeys run
 * in the keyboard-only project too, where pointer events are impossible — this
 * is where "usable with arrow keys" is really checked, because happy-dom gives
 * every element a zero-sized rectangle and cannot answer a question about
 * direction.
 */

/** The password every sample user on the fake Jellyfin has. */
const PASSWORD = 'correct horse';

/** Teal, as `src/settings/accent-colours.ts` defines it. */
const TEAL = '#00a3a3';
/** Red, the default, which `base.css` also ships as its literal. */
const RED = '#d1121b';

// A save still in flight when the last test ended lands after its own reset,
// so the sample data is put back before each test as well as after.
test.beforeEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

test.afterEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

async function signInAndLand(page: Page): Promise<void> {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
}

/**
 * Opens the settings screen the way this viewport offers it.
 *
 * On a wide screen the top bar carries its own Settings link, after the
 * sections — `/settings` is not one of them (#11).
 *
 * A phone's bottom bar has no room for a fifth item, and its fourth is the
 * User picture, which switches User (#8). So a phone goes through the User
 * Picker, which is where a household's own things live and which carries the
 * link. Only one bar is in the document at a time (#6), so which bar is there
 * is the signal for which way round this is — and the links are scoped to the
 * thing that holds them, because on a wide screen both exist once the picker
 * is open.
 */
async function openSettings(page: Page, name = 'Settings'): Promise<void> {
  const topBar = page.locator('.top-bar');
  if ((await topBar.count()) > 0) {
    await topBar.getByRole('link', { name }).press('Enter');
  } else {
    // Named for who is watching rather than for settings, so it is found by
    // its class and this helper stays language-agnostic.
    await page.locator('.bottom-bar__user').press('Enter');
    await page.locator('.user-picker').getByRole('link', { name }).press('Enter');
  }
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible();
  // Nothing is offered until the Server has answered, so the controls arriving
  // is the signal that a press will land on the User's real settings.
  await expect(page.getByRole('group', { name: /Accent Colour|Color de acento/ })).toBeVisible();
}

/**
 * The accent the app is really painted with: the token every rule reads, as the
 * browser resolves it on the root element.
 */
function paintedAccent(page: Page): Promise<string> {
  return page.evaluate(() =>
    window.getComputedStyle(document.documentElement).getPropertyValue('--accent').trim(),
  );
}

/** The same User on a second device: it shares nothing with the first. */
async function onAnotherDevice(browser: Browser, visit: (page: Page) => Promise<void>) {
  const context = await browser.newContext();
  try {
    await visit(await context.newPage());
  } finally {
    await context.close();
  }
}

test('a new User’s app is red until they choose otherwise', async ({ page }) => {
  await signInAndLand(page);

  expect(await paintedAccent(page)).toBe(RED);
});

test('the Accent Colour a User picks paints the app and follows them', async ({
  page,
  browser,
}) => {
  await signInAndLand(page);
  await openSettings(page);

  await page.getByRole('button', { name: 'Teal' }).press('Enter');

  await expect.poll(() => paintedAccent(page)).toBe(TEAL);
  await expect(page.getByRole('button', { name: 'Teal', pressed: true })).toBeVisible();

  await onAnotherDevice(browser, async (elsewhere) => {
    await signInAndLand(elsewhere);

    // Only the Server could have carried it: this browser has never seen the
    // first one's storage (story 49).
    await expect.poll(() => paintedAccent(elsewhere)).toBe(TEAL);
  });
});

test('a colour is chosen with nothing but arrows and Enter', async ({ page }) => {
  await signInAndLand(page);
  await openSettings(page);

  // Start on the colour the User is using, then move by direction alone.
  await page.getByRole('button', { name: 'Red' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('Amber');

  await page.keyboard.press('Enter');

  await expect(page.getByRole('button', { name: 'Amber', pressed: true })).toBeVisible();
});

test('the language a User picks changes the app at once and follows them', async ({
  page,
  browser,
}) => {
  await signInAndLand(page);
  await openSettings(page);

  await page.getByRole('button', { name: 'Español' }).press('Enter');

  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();

  await onAnotherDevice(browser, async (elsewhere) => {
    await signInAndLand(elsewhere);
    await openSettings(elsewhere, 'Ajustes');

    await expect(elsewhere.getByRole('button', { name: 'Español', pressed: true })).toBeVisible();
  });
});

test('going back to the device’s language leaves nothing stored', async ({ page }) => {
  await signInAndLand(page);
  await openSettings(page);
  await page.getByRole('button', { name: 'Español' }).press('Enter');
  await expect(page.getByRole('heading', { level: 1, name: 'Ajustes' })).toBeVisible();

  await page.getByRole('button', { name: 'El de mi dispositivo (English)' }).press('Enter');

  await expect(page.getByRole('heading', { level: 1, name: 'Settings' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Match my device (English)', pressed: true }),
  ).toBeVisible();
});

test.describe('driving the language choice with the arrow keys', () => {
  // Wide enough for the three choices to sit side by side, so "the one to the
  // left" is a direction a User can press. Below 640px they stack and Up and
  // Down reach them instead — the same buttons either way.
  test.use({ viewport: { width: 1024, height: 800 } });

  test('picks a language with nothing but arrows and Enter', async ({ page }) => {
    await signInAndLand(page);
    await openSettings(page);

    await page.getByRole('button', { name: 'Español' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.textContent))
      .toBe('English');

    await page.keyboard.press('Enter');

    await expect(page.getByRole('button', { name: 'English', pressed: true })).toBeVisible();
    // And "match my device" is no longer the choice, though English is what
    // this device asks for anyway: the two are different settings.
    await expect(
      page.getByRole('button', { name: 'Match my device (English)', pressed: false }),
    ).toBeVisible();
  });
});

/**
 * The Playback Preferences (#35, story 114). These are the User's **Jellyfin**
 * settings, so the thing to check in a browser is not only that the screen
 * remembers them but that they are in the place every other Jellyfin app
 * reads: `UserConfiguration` on the account, which is what makes "a change
 * takes effect on the next playback" true wherever the playing happens.
 */
test.describe('what plays', () => {
  /** What the Server holds for a User, as another Jellyfin app would read it. */
  async function configurationOnTheServer(
    request: APIRequestContext,
    userId: string,
  ): Promise<Record<string, unknown>> {
    const state = (await (await request.get(`${FAKE_JELLYFIN_URL}/__fake/state`)).json()) as {
      userConfiguration?: Record<string, Record<string, unknown>>;
    };
    return state.userConfiguration?.[userId] ?? {};
  }

  test('a choice lands on the User’s Jellyfin account, where the next playback reads it', async ({
    page,
    request,
  }) => {
    await signInAndLand(page);
    await openSettings(page);

    const audio = page.getByRole('group', { name: 'Audio language' });
    await audio.getByRole('button', { name: 'Japanese' }).press('Enter');
    await page.getByRole('button', { name: 'Never' }).press('Enter');
    await page.getByRole('button', { name: 'Ask me each time' }).press('Enter');

    await expect(audio.getByRole('button', { name: 'Japanese', pressed: true })).toBeVisible();
    // The Server's own copy, not the screen's: this is the `UserConfiguration`
    // a player — Jellyflick's or any other Jellyfin app's — reads when it
    // starts the next Movie or Episode.
    await expect
      .poll(async () => await configurationOnTheServer(request, 'user-rafael'))
      .toMatchObject({
        AudioLanguagePreference: 'jpn',
        SubtitleMode: 'None',
        EnableNextEpisodeAutoPlay: false,
      });
  });

  test('the choices follow the User to another device', async ({ page, browser }) => {
    await signInAndLand(page);
    await openSettings(page);

    await page.getByRole('group', { name: 'Audio language' }).getByRole('button', { name: 'French' }).press('Enter');

    await onAnotherDevice(browser, async (elsewhere) => {
      await signInAndLand(elsewhere);
      await openSettings(elsewhere);

      // Only the Server could have carried it: this browser has never seen the
      // first one's storage.
      await expect(
        elsewhere
          .getByRole('group', { name: 'Audio language' })
          .getByRole('button', { name: 'French', pressed: true }),
      ).toBeVisible();
    });
  });

  test.describe('driving a language choice with the arrow keys', () => {
    // Wide enough for the languages to wrap into five columns, so "the one to
    // the right" is a direction a User can press. On a phone they wrap into
    // two and Down reaches them instead — the autoplay test below is the one
    // that holds both ways round, because it has only two choices and so the
    // answer is the same whichever way they are laid out.
    test.use({ viewport: { width: 1024, height: 900 } });

    test('picks a language with nothing but arrows and Enter', async ({ page }) => {
      await signInAndLand(page);
      await openSettings(page);

      // This is the check that the choice works with a remote, which happy-dom
      // cannot answer because it gives every element a zero-sized rectangle.
      const audio = page.getByRole('group', { name: 'Audio language' });
      await audio.getByRole('button', { name: 'No preference' }).focus();
      await page.keyboard.press('ArrowRight');
      await expect
        .poll(() => page.evaluate(() => document.activeElement?.textContent))
        .toBe('English');

      await page.keyboard.press('Enter');

      await expect(audio.getByRole('button', { name: 'English', pressed: true })).toBeVisible();
      await expect(
        audio.getByRole('button', { name: 'No preference', pressed: false }),
      ).toBeVisible();
    });
  });

  test('autoplay is turned off with nothing but arrows and Enter', async ({ page }) => {
    await signInAndLand(page);
    await openSettings(page);

    await page.getByRole('button', { name: 'Start the next one' }).focus();
    // Two buttons side by side above 640px and stacked below it, so the way to
    // the other one is Right on a wide screen and Down on a phone. Either press
    // has to land on it — that is the whole point of not using a radio group.
    const wide = await page.evaluate(() => window.innerWidth >= 640);
    await page.keyboard.press(wide ? 'ArrowRight' : 'ArrowDown');
    await page.keyboard.press('Enter');

    await expect(
      page.getByRole('button', { name: 'Ask me each time', pressed: true }),
    ).toBeVisible();
  });
});

test('the Home Layout editor is reached from the settings screen', async ({ page }) => {
  await signInAndLand(page);
  await openSettings(page);

  await page.getByRole('link', { name: 'Edit Home' }).press('Enter');

  await expect(page.getByRole('heading', { level: 1, name: 'Edit Home' })).toBeVisible();
});
