import { afterEach, describe, expect, it } from 'vitest';
import { createJellyfinGateway, type JellyfinGateway } from '../../src/jellyfin/gateway';
import {
  loadBecauseYouWatched,
  loadCollectionRow,
  loadGenreRow,
  loadWatchAgain,
} from '../../src/home/suggestion-rows';
import { resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * Which Titles each of #15's Rows picks, read from the Server: Watch Again,
 * Because You Watched, a genre Row and a Collection Row (stories 43 to 46).
 *
 * The seam is each loader's exported function, against the fake Jellyfin
 * through the real gateway — the selection *is* what the Server is asked and
 * what is made of the answer, so faking anything closer in would test nothing.
 * What the Rows look like on Home is `editing-the-home-layout.test.tsx` and the
 * Playwright specs.
 */

/** A gateway signed in as Rafael, against the fake Jellyfin's sample library. */
function gatewayForRafael(deviceId: string): JellyfinGateway {
  return createJellyfinGateway({
    serverAddress: fakeJellyfinUrl(),
    client: 'Jellyflick',
    device: 'Test Device',
    deviceId,
    appVersion: 'test',
    token: `token-user-rafael-${deviceId}`,
  });
}

/** A gateway with no token at all, which is a Server that will not answer. */
function gatewayWithNoToken(): JellyfinGateway {
  return createJellyfinGateway({
    serverAddress: fakeJellyfinUrl(),
    client: 'Jellyflick',
    device: 'Test Device',
    deviceId: 'no-token',
    appVersion: 'test',
  });
}

const names = (result: { outcome: string; titles?: readonly { name: string }[] }) =>
  (result.titles ?? []).map((card) => card.name);

afterEach(async () => {
  await resetFakeState();
});

describe('the Watch Again Row', () => {
  it('is the Titles the User finished, the most recently finished first', async () => {
    // A household that has finished a film and a whole Series, and started
    // neither of the others.
    await setFakeState({
      played: { 'user-rafael': ['movie-heat', 'series-severance'] },
      lastPlayedDates: {
        'user-rafael': {
          'movie-heat': '2026-10-01T20:00:00Z',
          'series-severance': '2026-10-09T21:00:00Z',
        },
      },
    });

    const row = await loadWatchAgain(gatewayForRafael('watch-again-order'));

    expect(names(row)).toEqual(['Severance', 'Heat']);
  });

  it('leaves out an Episode, because what a User rewatches is its Series', async () => {
    await setFakeState({
      played: { 'user-rafael': ['episode-severance-s2e3', 'movie-heat'] },
      lastPlayedDates: {
        'user-rafael': {
          'episode-severance-s2e3': '2026-10-10T21:00:00Z',
          'movie-heat': '2026-10-01T20:00:00Z',
        },
      },
    });

    const row = await loadWatchAgain(gatewayForRafael('watch-again-no-episodes'));

    expect(names(row)).toEqual(['Heat']);
  });

  it('is empty for a User who has finished nothing yet', async () => {
    const row = await loadWatchAgain(gatewayForRafael('watch-again-empty'));

    expect(row).toEqual({ outcome: 'row', titles: [] });
  });

  it('says it is unavailable when the Server will not answer', async () => {
    expect(await loadWatchAgain(gatewayWithNoToken())).toEqual({ outcome: 'unavailable' });
  });
});

describe('the Because You Watched Row', () => {
  it('suggests what is similar to a Series the User recently finished', async () => {
    await setFakeState({
      played: { 'user-rafael': ['series-severance'] },
      lastPlayedDates: { 'user-rafael': { 'series-severance': '2026-10-09T21:00:00Z' } },
    });

    const row = await loadBecauseYouWatched(gatewayForRafael('byw-series'));

    // The fixed More like this relation: Severance is like Arrival.
    expect(names(row)).toEqual(['Arrival']);
    // Named after the Title it came from: "Because You Watched" on its own
    // tells a User nothing about why the Row is there.
    expect(row.outcome === 'row' && row.heading).toBe('Severance');
  });

  it('uses Jellyfin’s own recommendations when what they finished was a Movie', async () => {
    await setFakeState({
      played: { 'user-rafael': ['movie-heat'] },
      lastPlayedDates: { 'user-rafael': { 'movie-heat': '2026-10-01T20:00:00Z' } },
      movieRecommendations: { 'movie-heat': ['movie-arrival', 'movie-paddington'] },
    });

    const row = await loadBecauseYouWatched(gatewayForRafael('byw-movie'));

    expect(names(row)).toEqual(['Arrival', 'Paddington']);
    expect(row.outcome === 'row' && row.heading).toBe('Heat');
  });

  it('suggests from the Title they finished most recently', async () => {
    await setFakeState({
      played: { 'user-rafael': ['movie-heat', 'series-severance'] },
      lastPlayedDates: {
        'user-rafael': {
          'movie-heat': '2026-10-01T20:00:00Z',
          'series-severance': '2026-10-09T21:00:00Z',
        },
      },
      movieRecommendations: { 'movie-heat': ['movie-paddington'] },
    });

    const row = await loadBecauseYouWatched(gatewayForRafael('byw-most-recent'));

    // Severance is the newer of the two, so the Row is its similar Titles and
    // not Heat's recommendations.
    expect(row.outcome === 'row' && row.heading).toBe('Severance');
    expect(names(row)).toEqual(['Arrival']);
  });

  it('never offers the User the very Title they just finished', async () => {
    await setFakeState({
      played: { 'user-rafael': ['movie-heat'] },
      lastPlayedDates: { 'user-rafael': { 'movie-heat': '2026-10-01T20:00:00Z' } },
      // A Server whose recommendations include the baseline Movie itself.
      movieRecommendations: { 'movie-heat': ['movie-heat', 'movie-arrival'] },
    });

    const row = await loadBecauseYouWatched(gatewayForRafael('byw-not-itself'));

    expect(names(row)).toEqual(['Arrival']);
  });

  it('falls back to the Title before it when the Server suggests nothing', async () => {
    await setFakeState({
      // The Unfinished is the newest thing they finished, and the Server has no
      // recommendations about it at all.
      played: { 'user-rafael': ['movie-unfinished', 'series-severance'] },
      lastPlayedDates: {
        'user-rafael': {
          'movie-unfinished': '2026-10-10T22:00:00Z',
          'series-severance': '2026-10-09T21:00:00Z',
        },
      },
    });

    const row = await loadBecauseYouWatched(gatewayForRafael('byw-fallback'));

    // An empty Row would be the wrong answer when the Title before it has
    // plenty to go on.
    expect(row.outcome === 'row' && row.heading).toBe('Severance');
    expect(names(row)).toEqual(['Arrival']);
  });

  it('names the Row after whatever the Server says the suggestions came from', async () => {
    await setFakeState({
      played: { 'user-rafael': ['movie-paddington', 'movie-heat'] },
      lastPlayedDates: {
        'user-rafael': {
          'movie-paddington': '2026-10-10T22:00:00Z',
          'movie-heat': '2026-10-01T20:00:00Z',
        },
      },
      // The Server's only category is about Heat, not about the film they
      // finished most recently.
      movieRecommendations: { 'movie-heat': ['movie-arrival'] },
    });

    const row = await loadBecauseYouWatched(gatewayForRafael('byw-honest-heading'));

    // Named after Heat, because that is what the Server suggested from: a
    // heading saying Paddington would be a lie about why Arrival is there.
    expect(row.outcome === 'row' && row.heading).toBe('Heat');
    expect(names(row)).toEqual(['Arrival']);
  });

  it('is empty for a User with no viewing history to go on', async () => {
    const row = await loadBecauseYouWatched(gatewayForRafael('byw-nothing-watched'));

    expect(row).toEqual({ outcome: 'row', titles: [] });
  });

  it('says it is unavailable when the Server will not answer', async () => {
    expect(await loadBecauseYouWatched(gatewayWithNoToken())).toEqual({
      outcome: 'unavailable',
    });
  });
});

describe('a genre Row', () => {
  it('is the Titles in the genre the User chose', async () => {
    const row = await loadGenreRow(gatewayForRafael('genre-drama'), 'Drama');

    // Both kinds, in name order, and only what is really in Drama.
    expect(names(row)).toEqual(['Arrival', 'Heat', 'Severance', 'The Unfinished']);
  });

  it('is headed by the genre’s own name', async () => {
    const row = await loadGenreRow(gatewayForRafael('genre-heading'), 'Comedy');

    expect(row.outcome === 'row' && row.heading).toBe('Comedy');
    expect(names(row)).toEqual(['Bluey', 'Paddington']);
  });

  it('holds nothing the app does not show, however the Server classifies it', async () => {
    // Classical is the music album's genre, and nothing else is in it: a Row
    // that forgot to narrow the kinds would show an album here.
    const row = await loadGenreRow(gatewayForRafael('genre-classical'), 'Classical');

    expect(row).toEqual({ outcome: 'row', titles: [], heading: 'Classical' });
  });

  it('says it is unavailable when the Server will not answer', async () => {
    expect(await loadGenreRow(gatewayWithNoToken(), 'Drama')).toEqual({
      outcome: 'unavailable',
    });
  });
});

describe('a Collection Row', () => {
  it('is the Titles in the Collection the User chose', async () => {
    const row = await loadCollectionRow(
      gatewayForRafael('collection-titles'),
      'boxset-crime-classics',
    );

    expect(names(row)).toEqual(['Arrival', 'Heat']);
  });

  it('is headed by the Collection’s own name, read from the Server', async () => {
    const row = await loadCollectionRow(
      gatewayForRafael('collection-heading'),
      'boxset-crime-classics',
    );

    // The layout stores the id, so the name has to come from the Server: a
    // Collection renamed there is renamed on Home.
    expect(row.outcome === 'row' && row.heading).toBe('Crime Classics');
  });

  it('is empty when the Collection is no longer on the Server', async () => {
    const row = await loadCollectionRow(gatewayForRafael('collection-gone'), 'boxset-gone');

    expect(row).toEqual({ outcome: 'row', titles: [] });
  });

  it('says it is unavailable when the Server will not answer', async () => {
    expect(await loadCollectionRow(gatewayWithNoToken(), 'boxset-crime-classics')).toEqual({
      outcome: 'unavailable',
    });
  });
});
