import type { APIRequestContext, Page } from '@playwright/test';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * Continue Watching in a browser (#12): the progress bar as it is really drawn,
 * and taking out each of the two kinds of entry — a part-watched Movie, and a
 * Series — with a pointer, which is the only thing that can reach a card's
 * controls today (see `src/home/continue-watching-row.tsx`).
 *
 * The merge, the order and the whole life of a hidden Series are
 * `test/unit/continue-watching.test.ts` and its journey test. What is here is
 * what only a laid-out page and a real pointer can say.
 */

const PASSWORD = 'correct horse';
const TICKS_PER_MINUTE = 60 * 10_000_000;
const PREFS_KEY = 'jellyflick|jellyflick|user-rafael';

/** The default Accent Colour, `--accent` in `src/styles/base.css`. */
const ACCENT = 'rgb(209, 18, 27)';

/** A household 42 minutes into Heat and one Episode into Severance. */
const WATCHING = {
  playbackPositions: { 'user-rafael': { 'movie-heat': 42 * TICKS_PER_MINUTE } },
  played: { 'user-rafael': ['episode-severance-s2e3'] },
  lastPlayedDates: {
    'user-rafael': {
      'episode-severance-s2e3': '2026-06-15T09:00:00Z',
      'movie-heat': '2026-06-14T21:00:00Z',
    },
  },
};

test.afterEach(async ({ request }) => {
  await request.delete(`${FAKE_JELLYFIN_URL}/__fake/state`);
});

async function signInWatching(page: Page, request: APIRequestContext) {
  await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, { data: WATCHING });
  await openApp(page, { serverAddress: FAKE_JELLYFIN_URL });
  await page.getByRole('button', { name: 'Rafael' }).press('Enter');
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByLabel('Password').press('Enter');
  await expect(page.getByText('Signed in as Rafael.')).toBeVisible();
}

function continueWatching(page: Page) {
  return page.getByRole('list', { name: 'Continue Watching' });
}

async function serverState(request: APIRequestContext): Promise<{
  playbackPositions: Record<string, Record<string, number>>;
  played: Record<string, string[]>;
  displayPreferences: Record<string, Record<string, string | null>>;
}> {
  return (await (await request.get(`${FAKE_JELLYFIN_URL}/__fake/state`)).json()) as never;
}

test('the Row shows what is part-watched and what comes next, most recent first', async ({
  page,
  request,
}) => {
  await signInWatching(page, request);

  await expect(continueWatching(page).locator('.card__name')).toHaveText(['Severance', 'Heat']);
});

test('a card’s progress bar is drawn across the bottom of its art, as far as the User got', async ({
  page,
  request,
}) => {
  await signInWatching(page, request);

  const card = continueWatching(page).getByRole('listitem', { name: 'Heat' });
  const bar = card.getByRole('progressbar');
  await expect(bar).toHaveAttribute('aria-valuenow', '25');

  // Only a real layout can say the watched part is a quarter of the bar, and
  // that the bar is on the artwork rather than under it.
  const artwork = await card.locator('img.card__artwork').boundingBox();
  const track = await bar.boundingBox();
  const watched = await bar.locator('.card__progress-watched').boundingBox();
  const artworkBottom = (artwork?.y ?? 0) + (artwork?.height ?? 0);
  expect((track?.y ?? 0) + (track?.height ?? 0)).toBeCloseTo(artworkBottom, 0);
  expect((watched?.width ?? 0) / (track?.width ?? 1)).toBeCloseTo(0.25, 2);

  await expect(bar.locator('.card__progress-watched')).toHaveCSS('background-color', ACCENT);
});

test.describe('taking something off the Row', () => {
  test.skip(
    ({ keyboardOnly }) => keyboardOnly,
    'a card’s controls are revealed by hover, so only a pointer reaches them until #21',
  );

  test('removing a part-watched Movie clears where the User got to and leaves their history', async ({
    page,
    request,
  }) => {
    await signInWatching(page, request);
    const heat = continueWatching(page).getByRole('listitem', { name: 'Heat' });

    // The control is drawn while the pointer is over the card, so hovering is
    // part of what is being tested.
    await heat.hover();
    await heat.getByRole('button', { name: 'Remove Heat from Continue Watching' }).click();

    await expect(continueWatching(page).locator('.card__name')).toHaveText(['Severance']);
    await expect
      .poll(async () => (await serverState(request)).playbackPositions['user-rafael']?.['movie-heat'])
      .toBe(0);
    // Only the position moved: the watched state and the play count are the
    // User's history and are left exactly as they were (story 37).
    expect((await serverState(request)).played['user-rafael']).toEqual([
      'episode-severance-s2e3',
    ]);
  });

  test('removing a Series stops its next Episode being offered, on every device', async ({
    page,
    request,
  }) => {
    await signInWatching(page, request);
    const severance = continueWatching(page).getByRole('listitem', { name: 'Severance' });

    await severance.hover();
    await severance
      .getByRole('button', { name: 'Remove Severance from Continue Watching' })
      .click();

    await expect(continueWatching(page).locator('.card__name')).toHaveText(['Heat']);

    // On the Server, so it follows the User to the next device they open: this is
    // a reload, which is as near to that as one browser gets.
    await expect
      .poll(async () => (await serverState(request)).displayPreferences[PREFS_KEY]?.['jf.hiddenSeries'])
      .toContain('series-severance');

    await page.reload();
    await expect(continueWatching(page).locator('.card__name')).toHaveText(['Heat']);
  });

  test('a Series the User removed comes back once they start another of its Episodes', async ({
    page,
    request,
  }) => {
    await signInWatching(page, request);
    const severance = continueWatching(page).getByRole('listitem', { name: 'Severance' });
    await severance.hover();
    await severance
      .getByRole('button', { name: 'Remove Severance from Continue Watching' })
      .click();
    await expect(continueWatching(page).locator('.card__name')).toHaveText(['Heat']);
    // The record is saved behind the screen, so wait for the Server to have it:
    // a reload before it landed would be a Series that was never hidden at all.
    await expect
      .poll(async () => (await serverState(request)).displayPreferences[PREFS_KEY]?.['jf.hiddenSeries'])
      .toContain('series-severance');

    // The household watches a bit of the next Episode, which is what the player
    // reports (#25) and what the Server records.
    await request.post(`${FAKE_JELLYFIN_URL}/__fake/state`, {
      data: {
        playbackPositions: {
          'user-rafael': {
            'movie-heat': 42 * TICKS_PER_MINUTE,
            'episode-severance-s2e4': 5 * TICKS_PER_MINUTE,
          },
        },
        lastPlayedDates: {
          'user-rafael': {
            'episode-severance-s2e3': '2026-06-15T09:00:00Z',
            'episode-severance-s2e4': new Date().toISOString(),
            'movie-heat': '2026-06-14T21:00:00Z',
          },
        },
      },
    });

    await page.reload();

    // Back on the Row without the User having to undo anything, and the record
    // that hid it is spent.
    await expect(continueWatching(page).locator('.card__name')).toHaveText(['Severance', 'Heat']);
    await expect
      .poll(async () => (await serverState(request)).displayPreferences[PREFS_KEY]?.['jf.hiddenSeries'])
      .toBe('[]');
  });
});
