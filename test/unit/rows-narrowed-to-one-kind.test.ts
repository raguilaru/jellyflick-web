import { afterEach, describe, expect, it } from 'vitest';
import { loadContinueWatching, continueWatchingRow } from '../../src/home/continue-watching';
import { loadNewOnJellyflick } from '../../src/home/new-on-jellyflick';
import { loadGenreRow } from '../../src/home/suggestion-rows';
import { loadBillboard } from '../../src/home/billboard-sources';
import { createJellyfinGateway } from '../../src/jellyfin/gateway';
import {
  fakeRequests,
  forgetFakeRequests,
  resetFakeState,
  setFakeState,
} from '../fake-jellyfin/control';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * The Movies and Series sections are Home's own Rows narrowed to one kind of
 * Title (#23). Each Row keeps every rule it has; what changes is the question
 * it asks the Server, and for Continue Watching, how many questions it asks at
 * all.
 */

afterEach(resetFakeState);

function gatewayForRafael(deviceId: string) {
  return createJellyfinGateway({
    serverAddress: fakeJellyfinUrl(),
    client: 'Jellyflick',
    device: 'Test Device',
    deviceId,
    appVersion: 'test',
    token: `token-user-rafael-${deviceId}`,
  });
}

/** What a household in the middle of a film and of a Series looks like. */
const WATCHING = {
  playbackPositions: { 'user-rafael': { 'movie-heat': 3_000_000_000 } },
  played: { 'user-rafael': ['episode-severance-s2e3'] },
  lastPlayedDates: {
    'user-rafael': {
      'movie-heat': '2026-06-14T21:00:00Z',
      'episode-severance-s2e3': '2026-06-15T09:00:00Z',
    },
  },
};

const names = (row: { entries: readonly { card: { name: string } }[] }) =>
  row.entries.map((entry) => entry.card.name);

describe('New on Jellyflick in a section of one kind', () => {
  it('is only the Movies for the Movies section, and only the Series for Series', async () => {
    const movies = await loadNewOnJellyflick(gatewayForRafael('new-movies'), { kind: 'Movie' });
    const series = await loadNewOnJellyflick(gatewayForRafael('new-series'), { kind: 'Series' });

    expect(movies.outcome === 'row' && movies.titles.map((card) => card.name)).toEqual([
      'Paddington',
      'Arrival',
      'Heat',
      'The Unfinished',
    ]);
    // Bluey and Severance arrive as Episodes and stand for their Series, which
    // is the merge's own rule: the kind is read off the Title the addition
    // stands for, not asked of the Server.
    expect(series.outcome === 'row' && series.titles.map((card) => card.name)).toEqual([
      'Bluey',
      'Severance',
    ]);
  });

  it('still asks every library, because a library’s type is not what it holds', async () => {
    await forgetFakeRequests();

    const series = await loadNewOnJellyflick(gatewayForRafael('new-asks-all'), {
      kind: 'Series',
    });

    const asked = (await fakeRequests())
      .filter((entry) => entry.path.startsWith('/Items/Latest'))
      .map((entry) => new URL(entry.path, fakeJellyfinUrl()).searchParams.get('parentId'))
      .sort();

    // The Kids library is typed `movies` and holds Bluey, which is a Series.
    // A section that narrowed the libraries by their type would have lost it,
    // and the music library is still out for everyone, as it always was.
    expect(asked).toEqual(['lib-kids', 'lib-movies', 'lib-series']);
    expect(series.outcome === 'row' && series.titles.map((card) => card.name)).toContain('Bluey');
  });
});

describe('Continue Watching in a section of one kind', () => {
  it('offers the part-watched Movies alone in the Movies section', async () => {
    await setFakeState(WATCHING);
    const gateway = gatewayForRafael('cw-movies');

    const read = await loadContinueWatching(gateway, { kind: 'Movie' });

    expect(read.outcome).toBe('read');
    if (read.outcome !== 'read') return;
    expect(names(continueWatchingRow({ gateway, read }))).toEqual(['Heat']);
  });

  it('offers the Series alone in the Series section, by the Episode to watch', async () => {
    await setFakeState(WATCHING);
    const gateway = gatewayForRafael('cw-series');

    const read = await loadContinueWatching(gateway, { kind: 'Series' });

    expect(read.outcome).toBe('read');
    if (read.outcome !== 'read') return;
    // The card is the Series', as it is on Home: what is resumed is an
    // Episode, and whose card is drawn is its Series.
    expect(names(continueWatchingRow({ gateway, read }))).toEqual(['Severance']);
  });

  it('does not ask a Movies section’s questions about Series', async () => {
    await setFakeState(WATCHING);
    await forgetFakeRequests();

    await loadContinueWatching(gatewayForRafael('cw-movies-reads'), { kind: 'Movie' });

    const paths = (await fakeRequests()).map((entry) => entry.path.split('?')[0]);
    // Both of the other two reads are about Series — the next Episode of each,
    // and when each was last watched — so a section about Movies makes one
    // read where Home makes three.
    expect(paths).toEqual(['/UserItems/Resume']);
  });
});

describe('a genre Row in a section of one kind', () => {
  it('holds only that kind, where the same Row on Home holds both', async () => {
    const onHome = await loadGenreRow(gatewayForRafael('genre-home'), 'Family');
    const inMovies = await loadGenreRow(gatewayForRafael('genre-movies'), 'Family', {
      kind: 'Movie',
    });

    expect(onHome.outcome === 'row' && onHome.titles.map((card) => card.name)).toEqual([
      'Bluey',
      'Paddington',
    ]);
    expect(inMovies.outcome === 'row' && inMovies.titles.map((card) => card.name)).toEqual([
      'Paddington',
    ]);
  });
});

describe('the Billboard over a section of one kind', () => {
  it('features a Title of that kind', async () => {
    // Every draw, so the assertion is about the pool and not about one number.
    for (const draw of [0, 0.25, 0.5, 0.75, 0.999]) {
      const movies = await loadBillboard(gatewayForRafael('bb-movies'), { draw, kind: 'Movie' });
      const series = await loadBillboard(gatewayForRafael('bb-series'), { draw, kind: 'Series' });

      // The kind rather than the name: which of the Movies with a backdrop
      // is featured is Spotlight's weighted draw, and this is an assertion
      // about the pool it draws from.
      expect(movies.outcome === 'feature' && movies.feature.title.kind).toBe('Movie');
      expect(series.outcome === 'feature' && series.feature.title.kind).toBe('Series');
    }
  });

  it('says there is nothing to feature rather than reaching for the other kind', async () => {
    // A Server holding one Series, and that Series with no backdrop.
    await setFakeState({ items: [] });

    expect(await loadBillboard(gatewayForRafael('bb-empty'), { draw: 0, kind: 'Series' })).toEqual(
      { outcome: 'empty' },
    );
  });
});
