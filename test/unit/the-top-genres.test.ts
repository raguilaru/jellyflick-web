import { afterEach, describe, expect, it } from 'vitest';
import { createJellyfinGateway } from '../../src/jellyfin/gateway';
import { loadTopGenres, topGenresOf, TOP_GENRE_ROWS } from '../../src/movies-and-series/top-genres';
import { resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

afterEach(resetFakeState);

const gatewayFor = (deviceId: string) =>
  createJellyfinGateway({
    serverAddress: fakeJellyfinUrl(),
    deviceId,
    client: 'Jellyflick',
    device: 'Test Device',
    appVersion: '0.1.0',
    token: `token-user-rafael-${deviceId}`,
  });

describe('the top genres of a section', () => {
  it('puts the genre most Titles are in first', () => {
    expect(
      topGenresOf([['Drama'], ['Drama', 'Crime'], ['Comedy']], 3),
    ).toEqual(['Drama', 'Comedy', 'Crime']);
  });

  it('breaks a tie by name, so an unchanged library ranks the same way twice', () => {
    expect(topGenresOf([['Thriller'], ['Comedy'], ['Drama']], 3)).toEqual([
      'Comedy',
      'Drama',
      'Thriller',
    ]);
  });

  it('offers only as many as were asked for', () => {
    expect(topGenresOf([['Comedy'], ['Drama'], ['Thriller']], 2)).toEqual(['Comedy', 'Drama']);
  });

  it('is nothing at all for a library whose Titles are in no genre', () => {
    expect(topGenresOf([[], []], 3)).toEqual([]);
  });

  it('ranks the genres of the Movies on the Server, not of everything it holds', async () => {
    // Three of the four sample Movies are Drama; the rest are in one each, so
    // the two behind it are the first two by name.
    expect(await loadTopGenres(gatewayFor('tops-movies'), { kind: 'Movie' })).toEqual([
      'Drama',
      'Comedy',
      'Crime',
    ]);
  });

  it('ranks the genres of the Series separately, because the sections are', async () => {
    // Bluey and Severance share no genre, so all five tie and the first three
    // by name win. Classical belongs to the music album and reaches neither.
    expect(await loadTopGenres(gatewayFor('tops-series'), { kind: 'Series' })).toEqual([
      'Comedy',
      'Drama',
      'Family',
    ]);
  });

  it('offers no genre Rows at all when the Server will not say what it holds', async () => {
    await setFakeState({ failLibraryQueriesWith: 500 });

    // Deliberately not a message of its own: the Rows beside it are reading
    // the same Server and already say so, and a fourth alarm saying the same
    // thing would be noise over a section that cannot draw anyway.
    expect(await loadTopGenres(gatewayFor('tops-refused'), { kind: 'Movie' })).toEqual([]);
  });

  it('draws three genre Rows, which is a section of Rows rather than a catalogue', () => {
    expect(TOP_GENRE_ROWS).toBe(3);
  });
});
