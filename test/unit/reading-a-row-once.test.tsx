import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import {
  fakeRequests,
  fakeWrites,
  forgetFakeRequests,
  forgetFakeWrites,
  resetFakeState,
  setFakeState,
} from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * What one screen costs the Server (#41).
 *
 * A Billboard Source asks its Row's own loader, which is what makes #22
 * correct — Resume inherits Continue Watching's three-read merge, its
 * one-entry-per-Title rule and its hidden-Series behaviour without a second
 * copy of any of them. The cost was that the reads were made twice: Home with
 * Resume featured and Continue Watching on it asked the Server the same three
 * questions over again.
 *
 * Nothing here is about what is on the screen. The seam is the **wire** — the
 * fake Jellyfin's own record of every request — because the deliverable is a
 * number of round trips and no assertion about the DOM can see it. That is
 * also what makes this honest about the fix: a shared read that quietly did
 * nothing, or that worked on Home and not on a section, would draw exactly the
 * same screen.
 */

const RAFAEL = 'user-rafael';

/** Jellyfin's 100-nanosecond ticks, from whole minutes. */
const ticks = (minutes: number) => minutes * 60 * 10_000_000;

/** A household part-way through an Episode of Severance, so Resume has a pick. */
const WATCHING_SEVERANCE = {
  playbackPositions: { [RAFAEL]: { 'episode-severance-s2e3': ticks(10) } },
  lastPlayedDates: { [RAFAEL]: { 'episode-severance-s2e3': '2026-06-16T09:00:00Z' } },
};

/** Rafael, with one Client Setting already on the Server. */
async function havingChosen(source: string): Promise<void> {
  await setFakeState({
    displayPreferences: { [`jellyflick|jellyflick|${RAFAEL}`]: { 'jf.billboardSource': source } },
  });
}

/**
 * A Client Settings save is written behind the User, so one a test started can
 * land after the next test has reseeded the Server (#46). The guard
 * `shifting-the-subtitles.test.tsx` wrote is copied here for the same reason.
 */
async function savesHaveSettled(): Promise<void> {
  let seen = -1;
  await waitFor(async () => {
    const now = (await fakeWrites()).length;
    const quiet = now === seen;
    seen = now;
    expect(quiet).toBe(true);
  });
}

afterEach(async () => {
  await savesHaveSettled();
  await resetFakeState();
});

beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  await resetFakeState();
  await forgetFakeWrites();
  await forgetFakeRequests();
});

async function signInAndLand(): Promise<void> {
  render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({ storage: inMemoryDeviceStorage(), randomSequence: [0] })}
      messages={en}
    />,
  );

  fireEvent.click(await screen.findByRole('button', { name: 'Rafael' }));
  fireEvent.input(await screen.findByLabelText('Password'), {
    target: { value: SAMPLE_PASSWORD },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
  await screen.findByText('Signed in as Rafael.');
}

/**
 * The Title the Billboard is featuring, however it is drawn: the heading holds
 * either the Title's logo, which names it through `alt`, or its name as text.
 */
async function featuredTitle(): Promise<string> {
  const heading = await screen.findByRole('heading', { level: 1 });
  const logo = heading.querySelector('img');
  return logo === null ? (heading.textContent ?? '') : (logo.getAttribute('alt') ?? '');
}

/**
 * Every library read the screen has made, by path.
 *
 * Counting whole paths rather than endpoints is the point: two reads of the
 * same question are two identical strings, and a Row narrowed to one kind asks
 * a different question that must still be asked.
 */
async function libraryReads(): Promise<string[]> {
  const requests = await fakeRequests();
  return requests
    .filter((request) => request.method === 'GET')
    .map((request) => request.path)
    .filter(isALibraryRead);
}

function isALibraryRead(path: string): boolean {
  for (const endpoint of ['/Items', '/UserItems/Resume', '/Shows/NextUp', '/UserViews']) {
    if (path === endpoint || path.startsWith(`${endpoint}?`) || path.startsWith(`${endpoint}/`)) {
      // Artwork is not a library read: it is one request per picture drawn.
      return path.indexOf('/Images/') === -1;
    }
  }
  return false;
}

/** The three questions Continue Watching asks (#12), however narrowed. */
function continueWatchingReads(reads: readonly string[]): string[] {
  return reads.filter(
    (path) =>
      path.startsWith('/UserItems/Resume') ||
      path.startsWith('/Shows/NextUp') ||
      (path.startsWith('/Items?') &&
        path.indexOf('isPlayed=true') !== -1 &&
        path.indexOf('includeItemTypes=Episode') !== -1),
  );
}

/**
 * Waits until the screen has stopped asking the Server anything.
 *
 * A count taken the moment the last card appears can miss a read still on its
 * way, which would make a duplicate read look like a fix. Two equal counts in
 * a row is settled.
 */
async function readsHaveSettled(): Promise<void> {
  let seen = -1;
  await waitFor(async () => {
    const now = (await fakeRequests()).length;
    const quiet = now === seen;
    seen = now;
    expect(quiet).toBe(true);
  });
}

describe('Home with Resume as the Billboard Source and Continue Watching as a Row', () => {
  it('asks Continue Watching’s three questions once between them, not twice', async () => {
    await havingChosen('resume');
    await setFakeState(WATCHING_SEVERANCE);

    await signInAndLand();
    // The Billboard really is Resume's pick, and the Row really is drawn:
    // without both on the screen there would be nothing to share.
    await screen.findByRole('list', { name: 'Continue Watching' });
    await waitFor(async () => {
      expect(await featuredTitle()).toBe('Severance');
    });
    await readsHaveSettled();

    const reads = continueWatchingReads(await libraryReads());

    // Three: what is part-watched, what comes next in each Series, and when
    // each Series was last watched. The Billboard and the Row share them.
    expect(reads.length).toBe(3);
    // And no question is asked twice, which is the same fact said so that a
    // failure names the duplicate.
    expect(reads.length).toBe(new Set(reads).size);
  });
});

/**
 * The other two Row-shaped Sources, and the plainer cases beside them.
 *
 * Each is asserted the same way: **no library read is made twice on the
 * screen.** That is a stronger thing to say than a count, and it is the
 * ticket's first box said literally — a Row and a Source that want the same
 * data read it once — without this file having to enumerate the endpoints
 * every Row happens to use today.
 */
describe('Home, whichever Billboard Source is featured', () => {
  /** A household with something finished, so Because You Watched has a Title. */
  const HAS_FINISHED_SOMETHING = {
    played: { [RAFAEL]: ['movie-arrival'] },
    lastPlayedDates: { [RAFAEL]: { 'movie-arrival': '2026-06-14T21:00:00Z' } },
  };

  async function landAndSettle(): Promise<string[]> {
    await signInAndLand();
    await screen.findByRole('list', { name: 'New on Jellyflick' });
    await waitFor(async () => {
      expect(await featuredTitle()).not.toBe('');
    });
    await readsHaveSettled();
    return await libraryReads();
  }

  function repeated(reads: readonly string[]): string[] {
    const seen = new Set<string>();
    return reads.filter((path) => (seen.has(path) ? true : (seen.add(path), false)));
  }

  it('asks each library for its newest additions once when Newest Addition is featured', async () => {
    await havingChosen('newest-addition');

    const reads = await landAndSettle();

    // `/UserViews` and one `/Items/Latest` per library that can hold Titles:
    // the Source and the Row between them, not each.
    const newOnJellyflick = reads.filter(
      (path) => path === '/UserViews' || path.startsWith('/Items/Latest?'),
    );
    expect(newOnJellyflick.length).toBe(4);
    expect(repeated(reads)).toEqual([]);
  });

  it('makes the Because You Watched Row’s two-step question once when it is featured', async () => {
    await havingChosen('because-you-watched');
    await setFakeState(HAS_FINISHED_SOMETHING);

    const reads = await landAndSettle();

    expect(repeated(reads)).toEqual([]);
  });

  it('reads nothing twice under Spotlight either, which shares no Row', async () => {
    // The plain case, and the guard that sharing has not introduced a cost of
    // its own where there was never a duplicate to remove.
    await setFakeState(WATCHING_SEVERANCE);

    const reads = await landAndSettle();

    expect(continueWatchingReads(reads).length).toBe(3);
    expect(repeated(reads)).toEqual([]);
  });
});

/**
 * A screen that is not Home (#23).
 *
 * The two sections compose Home's own Rows through the same registry, so a
 * cache shared too widely would be seen here first: Movies' Continue Watching
 * asks the Server one narrowed question where Home asks three, and handing
 * Series that answer would be a silent, invisible bug — the Row would simply
 * be short.
 */
describe('the Movies and Series sections', () => {
  /**
   * Home, read and **settled**, before the section's own reads are counted.
   *
   * Waiting for an element to appear is not waiting for the screen to have
   * stopped asking: Home's own reads can land after a bare `findBy` has
   * returned, and forgetting the log at that moment counts them against the
   * section instead. This is what made the first version of the Movies test
   * fail one run in three.
   */
  async function landOnHome(): Promise<void> {
    await signInAndLand();
    await screen.findByRole('list', { name: 'New on Jellyflick' });
    await readsHaveSettled();
  }

  async function openSection(name: 'Movies' | 'Series'): Promise<void> {
    fireEvent.click(screen.getByRole('link', { name }));
    await screen.findByRole('heading', { name, level: 1 });
    await waitFor(() => {
      expect(document.querySelector('.billboard__title')).toBeTruthy();
    });
    await readsHaveSettled();
  }

  it('asks Continue Watching its one narrowed question once on Movies', async () => {
    await setFakeState(WATCHING_SEVERANCE);
    await landOnHome();
    await forgetFakeRequests();

    await openSection('Movies');

    // One read, not three: the other two are questions about Series, which a
    // section of Movies has nothing to merge them into (#23).
    const reads = await libraryReads();
    expect(continueWatchingReads(reads).length).toBe(1);
    expect(reads.filter((path) => path.startsWith('/Shows/NextUp'))).toEqual([]);
  });

  it('does not carry Movies’ answer into Series', async () => {
    await setFakeState(WATCHING_SEVERANCE);
    await landOnHome();
    await openSection('Movies');
    await forgetFakeRequests();

    await openSection('Series');

    // A section's reads are its own: Series asks all three, narrowed to
    // itself, rather than being handed what Movies was told.
    const reads = await libraryReads();
    expect(continueWatchingReads(reads).length).toBe(3);
  });

  it('reads Home again on the way back, rather than showing what it was told before', async () => {
    // The cache is one screen's and nothing longer. Home unmounts on a
    // navigation and reads itself again on the way back, and that must still
    // be true — a cache that outlived the visit would quietly stop Home
    // noticing anything the household had watched since.
    await havingChosen('resume');
    await setFakeState(WATCHING_SEVERANCE);
    await landOnHome();
    await screen.findByRole('list', { name: 'Continue Watching' });
    await openSection('Movies');
    await forgetFakeRequests();

    fireEvent.click(screen.getByRole('link', { name: 'Home' }));
    await screen.findByRole('list', { name: 'Continue Watching' });
    await readsHaveSettled();

    // Three again — read afresh, and still only once between the Row and the
    // Billboard Source above it.
    expect(continueWatchingReads(await libraryReads()).length).toBe(3);
  });
});
