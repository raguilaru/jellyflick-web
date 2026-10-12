import type { Browser, Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Editing the Home Layout in a browser, and finding the change on another
 * device (#10, stories 48 and 49).
 *
 * "Another device" is a second browser context: its own storage, its own
 * sign-in, its own DeviceId and token. Nothing of the first one's reaches it,
 * so a setting that shows up there came from the Server and nowhere else —
 * which is the whole point of keeping it there.
 *
 * Every press here is a key press rather than a click, so these journeys run
 * in the keyboard-only project too, where pointer events are made impossible.
 */

/** The password every sample user on the fake Jellyfin has. */
const PASSWORD = 'correct horse';

const DEFAULT_ROWS = [
  'Continue Watching',
  'My List',
  'New on Jellyflick',
  'Watch Again',
  'Because You Watched',
];

// The sample data is put back before each test as well as after: these tests
// save a layout on the Server, and a save still in flight when the last test
// ended lands after its own reset and changes the Home this one starts on.
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

async function openTheEditor(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Edit Home' }).press('Enter');
  await expect(page.getByRole('heading', { name: 'Edit Home', level: 1 })).toBeVisible();
  // The editor now offers nothing to press until the Server has answered (#11
  // fixed that), so waiting for the list of Rows is waiting for the User's own
  // layout rather than the defaults. This used to be a `networkidle` wait,
  // which papered over a press being able to land on the defaults.
  await expect(page.locator('.layout-row').first()).toBeVisible();
}

async function backToHome(page: Page): Promise<void> {
  await page.getByRole('link', { name: 'Done' }).press('Enter');
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
}

/** The Rows the editor lists, in the order Home draws them. */
function listedRows(page: Page) {
  return page.locator('.layout-row__name');
}

/**
 * The same User on a second device, which is a context of its own: it shares
 * nothing with the first but the Server.
 */
async function onAnotherDevice(browser: Browser, visit: (page: Page) => Promise<void>) {
  const context = await browser.newContext();
  try {
    await visit(await context.newPage());
  } finally {
    await context.close();
  }
}

test('a new User’s Home comes with a sensible set of Rows', async ({ page }) => {
  await signInAndLand(page);
  await openTheEditor(page);

  await expect(listedRows(page)).toHaveText(DEFAULT_ROWS);
});

test('hiding a Row takes it off Home', async ({ page }) => {
  await signInAndLand(page);
  await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();

  await openTheEditor(page);
  await page.getByRole('button', { name: 'Hide New on Jellyflick' }).press('Enter');
  // Every Row whose feature is built, or Home would still be drawing one of
  // them. The rest are in the layout but are not on Home yet.
  await page.getByRole('button', { name: 'Hide Continue Watching' }).press('Enter');
  await page.getByRole('button', { name: 'Hide My List' }).press('Enter');
  await backToHome(page);

  await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toHaveCount(0);
  await expect(
    page.getByText('No Rows are shown on Home. Edit Home to choose some.'),
  ).toBeVisible();
});

test('a hidden Row comes back where it was', async ({ page }) => {
  await signInAndLand(page);
  await openTheEditor(page);

  await page.getByRole('button', { name: 'Hide New on Jellyflick' }).press('Enter');
  await page.getByRole('button', { name: 'Show New on Jellyflick' }).press('Enter');

  await expect(listedRows(page)).toHaveText(DEFAULT_ROWS);
  await backToHome(page);
  await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();
});

test('a change to Home follows the User to another device', async ({ page, browser }) => {
  await signInAndLand(page);
  await openTheEditor(page);

  await page.getByRole('button', { name: 'Move New on Jellyflick up' }).press('Enter');
  await page.getByRole('button', { name: 'Hide My List' }).press('Enter');
  await expect(listedRows(page)).toHaveText([
    'Continue Watching',
    'New on Jellyflick',
    'My List',
    'Watch Again',
    'Because You Watched',
  ]);

  await onAnotherDevice(browser, async (elsewhere) => {
    await signInAndLand(elsewhere);
    await openTheEditor(elsewhere);

    // The order and the hiding both arrived, and only the Server could have
    // carried them: this browser has never seen the first one's storage.
    await expect(listedRows(elsewhere)).toHaveText([
      'Continue Watching',
      'New on Jellyflick',
      'My List',
      'Watch Again',
      'Because You Watched',
    ]);
    await expect(elsewhere.getByRole('button', { name: 'Show My List' })).toBeVisible();
  });
});

test('a hidden Row is still hidden on another device’s Home', async ({ page, browser }) => {
  await signInAndLand(page);
  await openTheEditor(page);
  await page.getByRole('button', { name: 'Hide New on Jellyflick' }).press('Enter');
  await backToHome(page);
  await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toHaveCount(0);

  await onAnotherDevice(browser, async (elsewhere) => {
    await signInAndLand(elsewhere);

    await expect(elsewhere.getByRole('list', { name: 'New on Jellyflick' })).toHaveCount(0);
  });
});

test('another User’s Home is their own', async ({ page, browser }) => {
  await signInAndLand(page);
  await openTheEditor(page);
  await page.getByRole('button', { name: 'Hide New on Jellyflick' }).press('Enter');

  await onAnotherDevice(browser, async (elsewhere) => {
    await openApp(elsewhere, { serverAddress: FAKE_JELLYFIN_URL });
    await elsewhere.getByRole('button', { name: 'Marina' }).press('Enter');
    await elsewhere.getByLabel('Password').fill(PASSWORD);
    await elsewhere.getByLabel('Password').press('Enter');

    await expect(elsewhere.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();
  });
});

test.describe('driving the editor with the arrow keys', () => {
  // Wide enough for a Row's buttons to sit side by side, so "the button to the
  // left" is a direction a User can press. Below 640px they stack, and Up and
  // Down reach them instead — the same buttons either way.
  test.use({ viewport: { width: 1024, height: 800 } });

  test('reorders a Row with nothing but arrows and Enter', async ({ page }) => {
    await signInAndLand(page);
    await openTheEditor(page);

    // Start somewhere a User can get to, then move by direction alone.
    await page.getByRole('button', { name: 'Hide New on Jellyflick' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect
      .poll(() => page.evaluate(() => document.activeElement?.textContent))
      .toBe('Move New on Jellyflick down');

    await page.keyboard.press('Enter');

    await expect(listedRows(page)).toHaveText([
      'Continue Watching',
      'My List',
      'Watch Again',
      'New on Jellyflick',
      'Because You Watched',
    ]);
  });

  test('adds a Row with nothing but arrows and Enter', async ({ page, request }) => {
    // A User who has only one Row, so there is something left to add.
    await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
      data: {
        displayPreferences: {
          'jellyflick|jellyflick|user-rafael': {
            'jf.homeLayout': JSON.stringify([{ kind: 'new-on-jellyflick' }]),
          },
        },
      },
    });

    await signInAndLand(page);
    await openTheEditor(page);
    await expect(listedRows(page)).toHaveText(['New on Jellyflick']);

    await page.getByRole('button', { name: 'Add Continue Watching' }).focus();
    await page.keyboard.press('Enter');

    await expect(listedRows(page)).toHaveText(['New on Jellyflick', 'Continue Watching']);
    await expect(page.getByRole('button', { name: 'Add Continue Watching' })).toHaveCount(0);
  });
});
