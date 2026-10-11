import type { Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Several Users of a household on one device, in a real browser: adding a
 * second one, picking who is watching, and switching between them (#8).
 *
 * Everything here is driven with Enter rather than clicks, so it runs in the
 * keyboard-only project too — where every pointer interaction is made
 * impossible. That is the point as much as the journey is: the User picture is
 * a focus stop in both bars now, and switching User has to work with nothing
 * but a remote (story 64).
 *
 * This spec also runs in the phone project, where the bottom bar carries the
 * picture instead of the top bar. Only one bar is in the document at a time, so
 * one locator finds whichever it is.
 */

/** The password every sample user on the fake Jellyfin has. */
const PASSWORD = 'correct horse';

// The fake remembers every request it has ever seen, and these tests sign the
// same sample Users in over and over — so what one test asks the Server has to
// be told apart from what the test before it did.
test.beforeEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/requests`);
});

test.afterEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

/** Signs in with a password from whichever sign-in screen is showing. */
async function signInAs(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name, exact: true }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByText(`Signed in as ${name}.`)).toBeVisible();
}

/** The User picture in whichever navigation bar this viewport has. */
function switchUserControl(page: Page, currentName: string) {
  return page.getByRole('button', { name: `Switch User, currently ${currentName}` });
}

async function openThePicker(page: Page, currentName: string): Promise<void> {
  await switchUserControl(page, currentName).press('Enter');
  await expect(page.getByRole('heading', { name: 'Who is watching?' })).toBeVisible();
}

/** Both household members signed in, Marina watching, from a clean device. */
async function signInBoth(page: Page): Promise<void> {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await signInAs(page, 'Rafael');
  await openThePicker(page, 'Rafael');
  await page.getByRole('button', { name: 'Add another User' }).press('Enter');
  await signInAs(page, 'Marina');
}

test('a second User is added without signing the first one out', async ({ page }) => {
  await signInBoth(page);

  await openThePicker(page, 'Marina');

  await expect(page.getByRole('button', { name: 'Rafael', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Marina', exact: true })).toBeVisible();
  // With a picture each, from the Server: the picker is how a household tells
  // itself apart at a glance.
  await expect(
    page.getByRole('button', { name: 'Rafael', exact: true }).locator('img'),
  ).toHaveAttribute('src', `${FAKE_JELLYFIN_URL}/UserImage?userId=user-rafael&tag=tag-rafael`);
});

test('picking a User never asks for their password again', async ({ page }) => {
  await signInBoth(page);

  await openThePicker(page, 'Marina');
  await page.getByRole('button', { name: 'Rafael', exact: true }).press('Enter');

  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveCount(0);
});

test('the app opens on the User Picker when more than one User is signed in', async ({ page }) => {
  await signInBoth(page);

  await page.reload();

  await expect(page.getByRole('heading', { name: 'Who is watching?' })).toBeVisible();
  // Nobody is watching yet, so neither User's Home is behind it.
  await expect(page.getByText('Signed in as Marina.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Marina', exact: true }).press('Enter');
  await expect(page.getByText('Signed in as Marina.')).toBeVisible();
});

test('one User is signed out and the other stays signed in', async ({ page }) => {
  await signInBoth(page);

  await openThePicker(page, 'Marina');
  await page.getByRole('button', { name: 'Sign out Marina' }).press('Enter');

  // Rafael is the only one left, so he is simply the one watching: there is
  // nothing to choose between any more.
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();

  // And he is still signed in after a reload, with no password asked for.
  await page.reload();
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
  await expect(page.getByLabel('Password')).toHaveCount(0);
});

test('switching User leaves nothing of the last User’s My List on the screen', async ({
  page,
  request,
}) => {
  // Rafael has a Title in My List and Marina has none, so the Row is his alone.
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
    data: { favourites: { 'user-rafael': ['movie-arrival'] } },
  });
  await signInBoth(page);

  // Marina is watching, and her My List is empty.
  await expect(page.getByRole('list', { name: 'My List' })).toHaveCount(0);

  await openThePicker(page, 'Marina');
  await page.getByRole('button', { name: 'Rafael', exact: true }).press('Enter');
  const myList = page.getByRole('list', { name: 'My List' });
  await expect(myList).toBeVisible();
  // Scoped to the Row: Arrival is in New on Jellyflick as well, because the
  // sample library is one library and My List is a view of it.
  await expect(myList.getByRole('listitem', { name: 'Arrival' })).toBeVisible();

  await openThePicker(page, 'Rafael');
  await page.getByRole('button', { name: 'Marina', exact: true }).press('Enter');

  await expect(page.getByText('Signed in as Marina.')).toBeVisible();
  await expect(myList).toHaveCount(0);
  // Marina's own card for the same Title is not marked as hers either.
  await expect(page.getByLabel('Remove Arrival from My List')).toHaveCount(0);
  await expect(page.getByLabel('Add Arrival to My List')).toHaveCount(1);
});

test('each signed-in User asks the Server with their own token and DeviceId', async ({
  page,
  request,
}) => {
  await signInBoth(page);
  // Marina's Home has read itself from the Server, so her token has been used
  // as well as Rafael's. Without this the assertion below races her Rows.
  await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();

  // One token per DeviceId is the Server's rule, so two Users on one device
  // means two DeviceIds — a shared one would knock the other's token out.
  const rafael = await deviceIdsUsedBy(request, 'user-rafael');
  const marina = await deviceIdsUsedBy(request, 'user-marina');

  // Each of them asks on exactly one DeviceId, and never on the other's.
  expect(rafael).toHaveLength(1);
  expect(marina).toHaveLength(1);
  expect(rafael[0]).not.toBe(marina[0]);
});

test('the Back key closes the User Picker without leaving the section', async ({ page }) => {
  await signInBoth(page);

  await openThePicker(page, 'Marina');
  // Escape is the Back key on a keyboard, and a remote's Back arrives as the
  // same logical key. The picker is an overlay rather than an address, so Back
  // closes it instead of navigating the screen behind it.
  await page.keyboard.press('Escape');

  await expect(page.getByRole('heading', { name: 'Who is watching?' })).toHaveCount(0);
  await expect(page.getByText('Signed in as Marina.')).toBeVisible();
});

/**
 * The User picture is the rightmost focus stop in the top bar, and a Row's last
 * card is the rightmost thing on the page. A Row is a line — Left and Right
 * walk it and the way out is Up or Down — so the end of a Row must not be a way
 * into the corner of the screen. `arrow-key-navigation.spec.ts` asserts the
 * staying-put half; this is the half about what is now sitting up there.
 */
test('the end of a Row does not step sideways into the User picture', async ({ page }) => {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await signInAs(page, 'Rafael');
  const strip = page.getByRole('list', { name: 'New on Jellyflick' });
  await expect(strip).toBeVisible();

  await strip.getByRole('listitem').first().focus();
  for (let press = 0; press < 10; press += 1) {
    await page.keyboard.press('ArrowRight');
  }

  await expect
    .poll(() => page.evaluate(() => document.activeElement?.getAttribute('aria-label')))
    .toBe('The Unfinished');

  // And the way out of a Row still reaches the bar the picture is in, so it is
  // not stranded: that is upwards on a desktop and downwards on a phone, where
  // the bar is fixed under the page.
  const towardsTheBar = (await page.locator('.top-bar').count()) === 1 ? 'ArrowUp' : 'ArrowDown';
  await page.keyboard.press(towardsTheBar);
  await expect
    .poll(() =>
      page.evaluate(() => document.activeElement?.closest('.top-bar, .bottom-bar') !== null),
    )
    .toBe(true);
});

test('changing the Server address signs every User out', async ({ page }) => {
  await signInBoth(page);

  // The host repointed the app. A different address is a different Server as
  // far as this app can tell, so no User stored against the old one survives.
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL.replace('127.0.0.1', 'localhost') });

  await expect(page.getByRole('heading', { name: 'Choose your User' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Who is watching?' })).toHaveCount(0);
});

type RequestReader = { get(url: string): Promise<{ json(): Promise<unknown> }> };

/**
 * The DeviceIds the fake saw one User's token arrive on. The fake derives a
 * token from the User and the DeviceId it was asked with, so a request can be
 * attributed to a User by its token alone.
 */
async function deviceIdsUsedBy(request: RequestReader, userId: string): Promise<string[]> {
  const response = await request.get(`${FAKE_JELLYFIN_URL}/__fake/requests`);
  const seen = (await response.json()) as { headers: Record<string, string> }[];
  const found = new Set<string>();
  for (const entry of seen) {
    const authorization = entry.headers.authorization ?? '';
    if (!authorization.includes(`Token="token-${userId}-`)) continue;
    const deviceId = /DeviceId="([^"]*)"/.exec(authorization);
    if (deviceId !== null) found.add(deviceId[1] as string);
  }
  return [...found];
}

/**
 * Settings are reached from the picker, and on a phone this is the only way
 * there. `/settings` is not a section, so neither bar lists it: the top bar
 * carries its own link after the sections (#11), while the bottom bar's fourth
 * item is the User picture, which switches User (#8). Driven with Enter, so it
 * holds for a remote as well as a phone.
 */
test('settings are reached from the picker, which is a phone’s only way there', async ({
  page,
}) => {
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await signInAs(page, 'Rafael');
  await openThePicker(page, 'Rafael');

  // Scoped to the picker: on a wide screen the top bar carries a Settings
  // link of its own, so an unscoped locator finds two.
  await page.locator('.user-picker').getByRole('link', { name: 'Settings' }).press('Enter');

  await expect(page).toHaveURL(/\/settings$/);
  // The overlay is state rather than an address, so it has to take itself off
  // the screen — nothing else would.
  await expect(page.getByRole('heading', { name: 'Who is watching?' })).toHaveCount(0);
});
