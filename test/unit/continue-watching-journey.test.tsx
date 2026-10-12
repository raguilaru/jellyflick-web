import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { App } from '../../src/app';
import { en } from '../../src/i18n/en';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { fakeState, resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * A household picking up where it left off: the Row as the fake Jellyfin
 * really answers it, and what taking something out of it does to the Server.
 *
 * The rules themselves are `continue-watching.test.ts`. What is here is the
 * three reads, the two writes and the lifecycle a stored list only has once it
 * is going through the Server.
 *
 * happy-dom gives every element a zero-sized rectangle, so nothing here is
 * about layout: the progress bar's own width is `test/e2e/continue-watching.spec.ts`.
 */

const ticks = (minutes: number) => minutes * 60 * 10_000_000;

/** A household that is part-way through Heat and watching Severance. */
const WATCHING = {
  playbackPositions: { 'user-rafael': { 'movie-heat': ticks(42) } },
  played: { 'user-rafael': ['episode-severance-s2e3'] },
  lastPlayedDates: {
    'user-rafael': {
      // Severance this morning, Heat the night before.
      'episode-severance-s2e3': '2026-06-15T09:00:00Z',
      'movie-heat': '2026-06-14T21:00:00Z',
    },
  },
};

afterEach(resetFakeState);

beforeEach(async () => {
  window.history.replaceState(null, '', '/');
  await resetFakeState();
});

async function signInAndLand() {
  render(
    <App
      config={{ presetServerAddress: fakeJellyfinUrl(), appVersion: 'test' }}
      device={testDeviceLayer({ storage: inMemoryDeviceStorage() })}
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

/** The names on the Row's cards, in the order they are shown. */
function cardNames(): string[] {
  const row = screen.queryByRole('list', { name: 'Continue Watching' });
  if (row === null) return [];
  return Array.from(row.querySelectorAll('.card__name')).map((name) => name.textContent ?? '');
}

/** What each card says about how far through it the User is, as whole percent. */
function progress(): (string | null)[] {
  const row = screen.getByRole('list', { name: 'Continue Watching' });
  return Array.from(row.querySelectorAll('[role="progressbar"]')).map((bar) =>
    bar.getAttribute('aria-valuenow'),
  );
}

async function storedState(): Promise<{
  playbackPositions: Record<string, Record<string, number>>;
  played: Record<string, string[]>;
  displayPreferences: Record<string, Record<string, string | null>>;
}> {
  return (await fakeState()) as never;
}

const PREFS_KEY = 'jellyflick|jellyflick|user-rafael';

describe('a household picking up where it left off', () => {
  it('has no Continue Watching Row until there is something to carry on with', async () => {
    await signInAndLand();

    await screen.findByRole('list', { name: 'New on Jellyflick' });
    expect(screen.queryByRole('list', { name: 'Continue Watching' })).toBeNull();
  });

  it('sees what it started and the next Episode of what it is watching, most recent first', async () => {
    await setFakeState(WATCHING);

    await signInAndLand();

    // Severance first: watched this morning, and offered as the Episode after
    // the one that was finished. Heat is the night before, part-watched.
    await waitFor(() => expect(cardNames()).toEqual(['Severance', 'Heat']));
  });

  it('sees how far through each card it is', async () => {
    await setFakeState(WATCHING);

    await signInAndLand();
    await waitFor(() => expect(cardNames()).toEqual(['Severance', 'Heat']));

    // Severance's next Episode has none of it watched; Heat is 42 of its 170
    // minutes in, which the Server itself works out as a percentage.
    expect(progress()).toEqual(['0', '25']);
  });

  it('takes a part-watched Movie out of the Row, leaving the watch history alone', async () => {
    await setFakeState(WATCHING);
    await signInAndLand();
    await waitFor(() => expect(cardNames()).toEqual(['Severance', 'Heat']));

    fireEvent.click(screen.getByRole('button', { name: 'Remove Heat from Continue Watching' }));

    await waitFor(() => expect(cardNames()).toEqual(['Severance']));
    await waitFor(async () => {
      const state = await storedState();
      // The resume point is cleared on the Server, and nothing else about it is
      // touched: story 37's "my watch history stays as it is".
      expect(state.playbackPositions['user-rafael']?.['movie-heat']).toBe(0);
      expect(state.played['user-rafael']).toEqual(['episode-severance-s2e3']);
    });
  });

  it('puts the card back and says so when the Server will not record the change', async () => {
    await setFakeState({ ...WATCHING, failUserItemDataWritesWith: 500 });
    await signInAndLand();
    await waitFor(() => expect(cardNames()).toEqual(['Severance', 'Heat']));

    fireEvent.click(screen.getByRole('button', { name: 'Remove Heat from Continue Watching' }));

    expect(
      (await screen.findByText('Jellyflick could not save that change on the Server.')).textContent,
    ).toBeTruthy();
    expect(cardNames()).toEqual(['Severance', 'Heat']);
  });

  it('takes a Series out of the Row and remembers that on the Server', async () => {
    await setFakeState(WATCHING);
    await signInAndLand();
    await waitFor(() => expect(cardNames()).toEqual(['Severance', 'Heat']));

    fireEvent.click(
      screen.getByRole('button', { name: 'Remove Severance from Continue Watching' }),
    );

    await waitFor(() => expect(cardNames()).toEqual(['Heat']));
    await waitFor(async () => {
      const state = await storedState();
      const stored = state.displayPreferences[PREFS_KEY]?.['jf.hiddenSeries'] ?? '[]';
      expect(JSON.parse(stored)).toEqual([
        { seriesId: 'series-severance', hiddenAt: Date.parse('2026-06-15T09:00:00Z') },
      ]);
      // A hidden Series is this app's own list, not a change to the account:
      // nothing of the User's watch history moved.
      expect(state.played['user-rafael']).toEqual(['episode-severance-s2e3']);
    });
  });

  it('keeps a hidden Series off the Row on the next device the User opens', async () => {
    await setFakeState({
      ...WATCHING,
      displayPreferences: {
        [PREFS_KEY]: {
          'jf.hiddenSeries': JSON.stringify([
            { seriesId: 'series-severance', hiddenAt: Date.parse('2026-06-15T09:00:00Z') },
          ]),
        },
      },
    });

    await signInAndLand();

    await waitFor(() => expect(cardNames()).toEqual(['Heat']));
  });

  it('shows a hidden Series again once another of its Episodes has been played', async () => {
    await setFakeState({
      ...WATCHING,
      playbackPositions: {
        'user-rafael': {
          'movie-heat': ticks(42),
          // Started after the Series was hidden, which is what brings it back.
          'episode-severance-s2e4': ticks(5),
        },
      },
      lastPlayedDates: {
        'user-rafael': {
          'episode-severance-s2e3': '2026-06-15T09:00:00Z',
          'episode-severance-s2e4': '2026-06-16T20:00:00Z',
          'movie-heat': '2026-06-14T21:00:00Z',
        },
      },
      displayPreferences: {
        [PREFS_KEY]: {
          'jf.hiddenSeries': JSON.stringify([
            { seriesId: 'series-severance', hiddenAt: Date.parse('2026-06-15T09:00:00Z') },
          ]),
        },
      },
    });

    await signInAndLand();

    await waitFor(() => expect(cardNames()).toEqual(['Severance', 'Heat']));
    // And the record that hid it is spent, so it cannot hide the Series a
    // second time the next time its next Episode comes round.
    await waitFor(async () => {
      const state = await storedState();
      expect(state.displayPreferences[PREFS_KEY]?.['jf.hiddenSeries']).toBe('[]');
    });
  });

  it('is told plainly when the Server will not say what it is watching', async () => {
    await setFakeState({ ...WATCHING, failLibraryQueriesWith: 503 });

    await signInAndLand();

    await waitFor(() =>
      expect(screen.getAllByRole('alert').map((alert) => alert.textContent)).toContain(
        'Jellyflick could not read what you are watching from the Server.',
      ),
    );
  });
});
