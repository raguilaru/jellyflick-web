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
