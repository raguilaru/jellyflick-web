import { execFileSync } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { devices, type Locator, type Page } from '@playwright/test';
import { startJellyflickServer, type JellyflickServer } from '../../server/jellyflick-server';
import { expect, FAKE_JELLYFIN_URL, openApp, test } from './fixtures';

/**
 * The enlarged hover card in a real browser (#21, stories 52 and 53).
 *
 * This is the only place the ticket can actually be checked, because almost
 * everything it asks for is a measurement: happy-dom gives every element a
 * zero-sized rectangle, so `test/unit/hover-cards-on-home.test.tsx` can follow
 * the behaviour as far as an attribute and no further.
 *
 * What is here and nowhere else:
 *
 * - **that the card really grows**, and that the grown card is not clipped by
 *   the strip it is in. A Row is `overflow-x: auto`, which clips vertically
 *   too, so a card scaled past the strip's padding would have its top and
 *   bottom shaved off — and every other assertion would still pass.
 * - **that nothing runs off the side of the screen at 375px.** #44's lesson,
 *   found by #20 on the title page next door: Playwright scrolls an element
 *   into view before touching it, so a sheet 635px wide on a 375px screen
 *   passed every assertion anybody had written. An enlarging card is exactly
 *   that failure shape, so the document's own scroll width is what is asserted.
 * - **that a touch device gets no hover card at all**, which needs a real
 *   touch emulation rather than a narrow window.
 * - **that the compact ratings are on it**, which needs the real container
 *   holding a real MDBList key behind a real `/api/ratings` route.
 *
 * The assertions are about rules, never about pixel counts: CI's Linux boxes
 * come out about 16px wider than macOS, and that margin alone has decided a
 * bug in this suite before.
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

/** One Title's card on New on Jellyflick. */
function cardFor(page: Page, name: string): Locator {
  return page.getByRole('list', { name: 'New on Jellyflick' }).getByRole('listitem', { name });
}

/**
 * Rests the pointer on a card and waits for it to enlarge.
 *
 * The pointer is put back on every attempt, which is the lesson `my-list.spec.ts`
 * wrote down for this same Row: a Row that has just landed is about to
 * re-render — the Title Labels and My List both arrive after it, and the
 * Billboard's artwork can shift the page later still — so a pointer that has
 * not moved may no longer be on the card it was over.
 */
async function restOn(card: Locator): Promise<void> {
  await expect(async () => {
    await card.hover();
    await expect(card).toHaveAttribute('data-resting', '', { timeout: 2_000 });
  }).toPass({ timeout: 20_000 });
}

/** Whether the document is wider than the window, which is the bug to catch. */
function overflowsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
}

test.describe('with a pointer', () => {
  test.skip(({ keyboardOnly }) => keyboardOnly, 'the hover card is a pointer’s to open');

  test('enlarges the card the pointer rests on, and says what the Title is', async ({ page }) => {
    await signIn(page);
    const card = cardFor(page, 'Arrival');
    const before = await card.boundingBox();

    await restOn(card);

    // Bigger than it was. The factor is the stylesheet's business; that it grew
    // at all is the ticket's.
    const after = await card.boundingBox();
    expect(after?.width ?? 0).toBeGreaterThan(before?.width ?? 0);
    expect(after?.height ?? 0).toBeGreaterThan(before?.height ?? 0);

    // Arrival on the sample Server: PG-13, 116 minutes, two genres.
    await expect(card.getByText('PG-13')).toBeVisible();
    await expect(card.getByText('1h 56m')).toBeVisible();
    await expect(card.getByText('Science Fiction, Drama')).toBeVisible();
  });

  test('offers Play, My List and More info, and none of them before the pointer rests', async ({
    page,
  }) => {
    await signIn(page);
    const card = cardFor(page, 'Arrival');

    // Nothing to press until the pointer is over the card: a control with a
    // box is a stop the arrow keys would have to step through, and a Row is a
    // line of cards (#8).
    await expect(card.getByRole('button', { name: 'Play Arrival' })).toBeHidden();

    await restOn(card);

    await expect(card.getByRole('button', { name: 'Play Arrival' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'Add Arrival to My List' })).toBeVisible();
    await expect(card.getByRole('button', { name: 'More info about Arrival' })).toBeVisible();
  });

  test('does not enlarge a card the pointer is only passing over', async ({ page }) => {
    await signIn(page);
    const arrival = cardFor(page, 'Arrival');
    const heat = cardFor(page, 'Heat');
    // The listener is attached a moment after the Row lands, so the sweep is
    // only meaningful once resting works at all on this Row.
    await restOn(arrival);
    await page.mouse.move(0, 0);
    await expect(arrival).not.toHaveAttribute('data-resting', '');

    // Straight across one card and on to the next, which is what reaching for
    // the far end of a Row looks like (story 53).
    await arrival.hover();
    await heat.hover();

    await expect(heat).toHaveAttribute('data-resting', '');
    // The one it passed over never opened, so a sweep along a Row does not
    // read six Titles off the Server on the way.
    await expect(arrival).not.toHaveAttribute('data-resting', '');
  });

  test('plays no video on hover, however long the pointer rests', async ({ page }) => {
    await signIn(page);
    const card = cardFor(page, 'Arrival');

    await restOn(card);

    // Story 53, and the spec's own "Out of scope: video previews on card
    // hover". Not a paused one and not a muted one — none.
    expect(await card.locator('video').count()).toBe(0);
  });

  test('plays the Title from the card, without opening its page', async ({ page }) => {
    await signIn(page);
    const card = cardFor(page, 'Arrival');
    await restOn(card);

    await card.getByRole('button', { name: 'Play Arrival' }).click();

    // The player over Home, and Home still behind it: story 52 is about acting
    // on a Title *without* opening the title page.
    //
    // The **address** is what says which screen this is, and a level-1 heading
    // is not: the Billboard above the Rows draws the featured Title's name in
    // an `<h1>`, and the Title it features on the sample Server is Arrival.
    // So "no h1 called Arrival" is false on Home whatever Play did, and "an h1
    // called Arrival" is true on Home before anything is pressed. The player
    // is an overlay rather than an address of its own (#25), so Home's own
    // address is still the one showing.
    await expect(page.getByRole('region', { name: 'Playing Arrival' })).toBeVisible();
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole('region', { name: 'Featured' })).toBeAttached();
  });

  test('opens the title page from More info', async ({ page }) => {
    await signIn(page);
    const card = cardFor(page, 'Arrival');
    await restOn(card);

    await card.getByRole('button', { name: 'More info about Arrival' }).click();

    // The address, for the reason above: the Billboard's own `<h1>` says
    // Arrival too, so only the address tells the two screens apart.
    await expect(page).toHaveURL(/\/title\/movie-arrival$/);
    await expect(page.getByRole('heading', { name: 'Arrival', level: 1 })).toBeVisible();
  });
});

test.describe('the shape of an enlarged card', () => {
  test.skip(({ keyboardOnly }) => keyboardOnly, 'the hover card is a pointer’s to open');

  test('stays inside the Row, which clips anything that grows past it', async ({ page }) => {
    await signIn(page);
    const card = cardFor(page, 'Arrival');
    await restOn(card);

    const strip = page.getByRole('list', { name: 'New on Jellyflick' });
    const grown = await card.boundingBox();
    const around = await strip.boundingBox();

    // `overflow-x: auto` clips on both axes, so a card scaled past the strip's
    // own padding loses its top and bottom — and every assertion about what is
    // "visible" would still pass, because Playwright scrolls before it looks.
    // A rule, not a measurement: CI's boxes are wider than a Mac's.
    expect(grown?.y ?? 0).toBeGreaterThanOrEqual((around?.y ?? 0) - 1);
    expect((grown?.y ?? 0) + (grown?.height ?? 0)).toBeLessThanOrEqual(
      (around?.y ?? 0) + (around?.height ?? 0) + 1,
    );
  });

  test('never pushes the page off the side of the screen, at 375px or at a desktop width', async ({
    page,
  }) => {
    await signIn(page);

    // The project's own width first, then the narrowest the app supports. This
    // is the assertion scrolling cannot paper over (#44, and `decisions.md`
    // §15's second half).
    await restOn(cardFor(page, 'Arrival'));
    expect(await overflowsSideways(page)).toBe(false);

    await page.setViewportSize({ width: 375, height: 700 });
    await restOn(cardFor(page, 'Arrival'));
    expect(await overflowsSideways(page)).toBe(false);
  });
});

test.describe('a touch device', () => {
  test.skip(({ keyboardOnly }) => keyboardOnly, 'this test brings its own context');

  test('gets no enlarged card at all, because it has nothing to rest', async ({ browser }) => {
    // A real touch emulation rather than a narrow window: the phone project is
    // a desktop Chrome at a phone's size, which really is a mouse, and a mouse
    // in a small window should get a hover card. What must not is a finger —
    // `(hover: hover)` is false and `deviceForm()` answers `handheld`, and the
    // card falls back to #13's plain toggle (story 55).
    const context = await browser.newContext({ ...devices['Pixel 5'] });
    const page = await context.newPage();
    try {
      await signIn(page);
      const card = cardFor(page, 'Arrival');

      await card.hover();
      await page.waitForTimeout(1_200);

      await expect(card).not.toHaveAttribute('data-resting', '');
      await expect(card.getByRole('button', { name: 'Play Arrival' })).toHaveCount(0);
      // The plain toggle is still what a card carries, untouched since #13.
      await expect(card.getByRole('button', { name: 'Add Arrival to My List' })).toHaveCount(1);
    } finally {
      await context.close();
    }
  });
});

/*
 * The compact extra ratings on the card (#20, story 82), which needs the real
 * container: the key lives inside it and the browser reads `/api/ratings`.
 * MDBList itself is the one thing faked, at the HTTP level, exactly as
 * `extra-ratings-on-the-title-page.spec.ts` fakes it.
 */

const DIST = join(import.meta.dirname, '..', '..', 'dist');
const ENTRYPOINT = join(import.meta.dirname, '..', '..', 'deploy', 'entrypoint.sh');

const ARRIVAL_RATINGS = {
  title: 'Arrival',
  ratings: [
    { source: 'audience', value: 82 },
    { source: 'metacritic', value: 81 },
    { source: 'letterboxd', value: 3.9 },
    { source: 'trakt', value: 78 },
  ],
};

function fakeMdbList(body: unknown): typeof globalThis.fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    })) as typeof globalThis.fetch;
}

test.describe('the ratings on an enlarged card', () => {
  test.skip(({ keyboardOnly }) => keyboardOnly, 'the hover card is a pointer’s to open');

  let container: JellyflickServer | undefined;

  test.afterEach(async () => {
    await container?.close();
    container = undefined;
  });

  test('are the compact ones, and are read only once a card is rested on', async ({ page }) => {
    const configDir = mkdtempSync(join(tmpdir(), 'jellyflick-hover-e2e-'));
    execFileSync('sh', [ENTRYPOINT, 'true'], {
      env: {
        PATH: process.env.PATH ?? '',
        JELLYFLICK_CONFIG_DIR: configDir,
        JELLYFIN_URL: FAKE_JELLYFIN_URL,
      },
    });
    container = await startJellyflickServer({
      root: DIST,
      configDir,
      mdbListApiKey: 'secret-key-42',
      fetch: fakeMdbList(ARRIVAL_RATINGS),
    });

    await page.goto(container.url);
    await page.getByRole('button', { name: 'Rafael' }).press('Enter');
    await page.getByLabel('Password').fill(PASSWORD);
    await page.getByLabel('Password').press('Enter');
    await expect(page.getByRole('list', { name: 'New on Jellyflick' })).toBeVisible();

    // Nothing has been asked about yet: a Row of cards that read eagerly would
    // burn MDBList's thousand requests a day on a User scrolling past
    // (`docs/research/ratings-mdblist.md`).
    await expect(page.getByRole('list', { name: 'Ratings' })).toHaveCount(0);

    const card = cardFor(page, 'Arrival');
    await restOn(card);

    const ratings = card.getByRole('list', { name: 'Ratings' });
    await expect(ratings.getByRole('listitem')).toHaveText([
      'Audience 82%',
      'Metacritic 81%',
      'Letterboxd 3.9/5',
      'Trakt 78%',
    ]);
    // Compact, which is the form #20 built for this card and the only one it
    // should use: the title page's heading is not on it.
    await expect(ratings).toHaveClass(/ratings--compact/);
    // And four badges plus the facts plus three buttons still fit on a card.
    expect(await overflowsSideways(page)).toBe(false);
  });
});
