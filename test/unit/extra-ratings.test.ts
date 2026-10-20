/**
 * @vitest-environment node
 *
 * The extra ratings a host's MDBList key buys (#20): which Title is looked up,
 * what comes back out of MDBList's answer, and what happens when the host set
 * no key at all.
 *
 * **MDBList is faked at the HTTP level and nothing else is.** The container's
 * own ratings route is the real one from `server/`, so the key injection, the
 * per-Title cache and the status contract this reader degrades against are all
 * exercised rather than imagined. `node` rather than happy-dom for the same
 * reason `container-server.test.ts` is: happy-dom's `fetch` applies the Same
 * Origin Policy and the container deliberately sends no CORS headers, because
 * in the image it is the app's own origin.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { startJellyflickServer, type JellyflickServer } from '../../server/jellyflick-server';
import {
  MDBLIST_GAME_OF_THRONES,
  MDBLIST_MATRIX,
  mdbListRatings,
} from '../fixtures/mdblist';
import type { TitleDetails } from '../../src/catalogue/catalogue';
import {
  extraRatingsFrom,
  ratingsLookupFor,
  readExtraRatings,
} from '../../src/ratings/extra-ratings';

/** A Movie as the title page holds one, with only the fields a lookup reads. */
function movie(providerIds: TitleDetails['providerIds']): TitleDetails {
  return {
    title: { kind: 'Movie', itemId: 'movie-arrival', name: 'Arrival' },
    genres: [],
    cast: [],
    audioLanguages: [],
    subtitleLanguages: [],
    watched: false,
    providerIds,
    localTrailerCount: 0,
    remoteTrailers: [],
  };
}

function series(providerIds: TitleDetails['providerIds']): TitleDetails {
  return { ...movie(providerIds), title: { kind: 'Series', itemId: 's', name: 'Severance' } };
}

describe('which Title MDBList is asked about', () => {
  it('prefers the IMDb id, which is the one MDBList indexes best', () => {
    expect(ratingsLookupFor(movie({ imdb: 'tt2543164', tmdb: '329865' }))).toEqual({
      provider: 'imdb',
      mediaType: 'movie',
      id: 'tt2543164',
    });
  });

  it('falls back to the TMDb id when the Server has no IMDb id', () => {
    expect(ratingsLookupFor(movie({ tmdb: '329865' }))).toEqual({
      provider: 'tmdb',
      mediaType: 'movie',
      id: '329865',
    });
  });

  it('asks about a Series as a show, which is MDBList’s own word for one', () => {
    expect(ratingsLookupFor(series({ imdb: 'tt11280740' }))?.mediaType).toBe('show');
  });

  it('has nothing to ask about a Title the Server gave no provider id', () => {
    expect(ratingsLookupFor(movie({}))).toBeUndefined();
  });

  it('has nothing to ask about an id MDBList’s route could not carry', () => {
    // The container's route takes `[A-Za-z0-9]{1,32}` and 400s on anything
    // else, so an id with a slash in it is not worth a request.
    expect(ratingsLookupFor(movie({ imdb: '../../etc/passwd' }))).toBeUndefined();
  });
});

describe('reading MDBList’s real answer, as captured with the host’s key (#45)', () => {
  it('draws all four badges for a Movie every source has rated', () => {
    // The Matrix, byte for byte from MDBList. Rotten Tomatoes' audience score
    // is on the wire as `popcorn` — `tomatoes` is the critics' tomatometer the
    // Server already sends as `CriticRating` — so this is the test that fails
    // if the adapter stops translating MDBList's names into the app's own.
    const ratings = extraRatingsFrom(MDBLIST_MATRIX);

    expect(ratings).toEqual([
      { source: 'metacritic', value: 73 },
      { source: 'trakt', value: 87 },
      { source: 'audience', value: 85 },
      { source: 'letterboxd', value: 4.2 },
    ]);
  });

  it('leaves out Letterboxd for a Series, which Letterboxd does not rate', () => {
    // Game of Thrones: `letterboxd` is `null`, and so are `rogerebert` and
    // `myanimelist`. Story 81 wants a missing rating left out, not a zero.
    const ratings = extraRatingsFrom(MDBLIST_GAME_OF_THRONES);

    expect(ratings).toEqual([
      { source: 'metacritic', value: 86 },
      { source: 'trakt', value: 89 },
      { source: 'audience', value: 85 },
    ]);
  });

  it('has no `audience` source to read, whatever §19’s table used to say', () => {
    // `audience` is MDBList's `return_rating` query parameter on the *list*
    // endpoints, not a `ratings[]` element's `source`: a real response never
    // carries one, and the app's own name for the source is not MDBList's.
    expect(mdbListRatings(MDBLIST_MATRIX).map(sourceOf)).not.toContain('audience');
    expect(extraRatingsFrom({ ratings: [{ source: 'audience', value: 85 }] })).toEqual([]);
  });

  it('reads the scale MDBList publishes, not the one it normalises to', () => {
    // Every element also carries an undocumented `score`, a 0–100 version of
    // `value` (Letterboxd's 4.2 stars are `score: 84`). The app deliberately
    // shows Letterboxd out of five, so `value` is what is read — decisions.md
    // §15. A reader that took `score` would make this 84/5.
    const letterboxd = mdbListRatings(MDBLIST_MATRIX).find(
      (entry) => sourceOf(entry) === 'letterboxd',
    );

    expect(letterboxd).toMatchObject({ value: 4.2, score: 84 });
    expect(extraRatingsFrom(MDBLIST_MATRIX)).toContainEqual({ source: 'letterboxd', value: 4.2 });
  });
});

/** One captured element's `source`, which is a bare object like any other. */
function sourceOf(entry: unknown): unknown {
  return (entry as { source?: unknown }).source;
}

describe('reading MDBList’s answer', () => {
  it('keeps the four sources Jellyfin does not already give, and names them', () => {
    const ratings = extraRatingsFrom({
      title: 'Arrival',
      ratings: [
        // `popcorn` on the wire is this app's `audience` (#45).
        { source: 'popcorn', value: 82 },
        { source: 'metacritic', value: 81 },
        { source: 'letterboxd', value: 3.9 },
        { source: 'trakt', value: 78 },
      ],
    });

    expect(ratings).toEqual([
      { source: 'audience', value: 82 },
      { source: 'metacritic', value: 81 },
      { source: 'letterboxd', value: 3.9 },
      { source: 'trakt', value: 78 },
    ]);
  });

  it('leaves out the sources the title page already has from the Server', () => {
    // Rotten Tomatoes' critics are `CriticRating` and IMDb's score is
    // `CommunityRating`: showing them twice is two numbers for one thing.
    const ratings = extraRatingsFrom({
      ratings: [
        { source: 'tomatoes', value: 94 },
        { source: 'imdb', value: 7.9 },
        { source: 'tmdb', value: 76 },
        { source: 'metacritic', value: 81 },
      ],
    });

    expect(ratings).toEqual([{ source: 'metacritic', value: 81 }]);
  });

  it('skips a source it does not recognise rather than failing', () => {
    // MDBList's schema types `ratings[]` as a bare object and documents no keys
    // at all (docs/research/ratings-mdblist.md §19), so an unknown source is
    // the expected case and not an error.
    const ratings = extraRatingsFrom({
      ratings: [
        { source: 'rogerebert', value: 75 },
        { source: 'popcorn', value: 82 },
      ],
    });

    expect(ratings).toEqual([{ source: 'audience', value: 82 }]);
  });

  it('leaves out a rating with no number on it, rather than showing a zero', () => {
    // Story 81: a missing rating is left out. MDBList sends `null` for a source
    // it has no value from, and the four scales are known, so a number off its
    // own scale is as absent as no number at all.
    const ratings = extraRatingsFrom({
      ratings: [
        { source: 'popcorn', value: null },
        { source: 'metacritic' },
        { source: 'letterboxd', value: 93 },
        { source: 'trakt', value: 78 },
      ],
    });

    expect(ratings).toEqual([{ source: 'trakt', value: 78 }]);
  });

  it('has nothing to show for an answer that is not MDBList’s at all', () => {
    expect(extraRatingsFrom({ error: 'not-found' })).toEqual([]);
    expect(extraRatingsFrom(undefined)).toEqual([]);
    expect(extraRatingsFrom('a string')).toEqual([]);
  });

  it('shows one rating per source, keeping the first MDBList listed', () => {
    const ratings = extraRatingsFrom({
      ratings: [
        { source: 'metacritic', value: 81 },
        { source: 'metacritic', value: 42 },
      ],
    });

    expect(ratings).toEqual([{ source: 'metacritic', value: 81 }]);
  });
});

/* ---------- Over HTTP, through the container's own ratings route ---------- */

const INDEX_HTML = '<!doctype html><title>Jellyflick</title><div id="app"></div>';

function makeAssets(): { root: string; configDir: string } {
  const base = mkdtempSync(join(tmpdir(), 'jellyflick-ratings-'));
  const root = join(base, 'app');
  const configDir = join(base, 'config');
  mkdirSync(root, { recursive: true });
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(root, 'index.html'), INDEX_HTML);
  return { root, configDir };
}

/**
 * A stand-in for MDBList. The upstream is the system boundary, so it is the one
 * thing faked: the route, the key injection and the cache under it are real.
 */
function fakeMdbList(answer: (url: string) => { status: number; body: unknown }): {
  fetch: typeof globalThis.fetch;
  calls: string[];
} {
  const calls: string[] = [];
  const fetchUpstream = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const { status, body } = answer(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  return { fetch: fetchUpstream, calls };
}

/**
 * What MDBList answers for Arrival, in **MDBList's own vocabulary** — see
 * `test/fixtures/mdblist.ts` for a whole captured response. `tomatoes` is the
 * critics' tomatometer the Server already sends, and `popcorn` is the audience
 * score the app calls `audience`: the two are different scores and the app
 * shows only the second of them (#45).
 */
const ARRIVAL_RATINGS = {
  title: 'Arrival',
  ratings: [
    { source: 'tomatoes', value: 94 },
    { source: 'popcorn', value: 82 },
    { source: 'metacritic', value: 81 },
    { source: 'letterboxd', value: 3.9 },
    { source: 'trakt', value: 78 },
  ],
};

const ARRIVAL_EXTRAS = [
  { source: 'audience', value: 82 },
  { source: 'metacritic', value: 81 },
  { source: 'letterboxd', value: 3.9 },
  { source: 'trakt', value: 78 },
];

let running: JellyflickServer | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

/**
 * The container as the browser reaches it. Every server gets its own ephemeral
 * port, which is also what keeps one test's reader cache out of the next one's:
 * the cache is keyed by the origin it read from.
 */
async function container(
  overrides: Partial<Parameters<typeof startJellyflickServer>[0]>,
): Promise<string> {
  const { root, configDir } = makeAssets();
  running = await startJellyflickServer({ root, configDir, mdbListApiKey: '', ...overrides });
  return running.url;
}

/** `fetch`, with a note of every address the reader asked for. */
function watchedFetch(): { fetch: typeof globalThis.fetch; asked: string[] } {
  const asked: string[] = [];
  const watched: typeof globalThis.fetch = async (input, init) => {
    asked.push(String(input));
    return fetch(input as string, init);
  };
  return { fetch: watched, asked };
}

describe('a User looking at a Title when the host has set an MDBList key', () => {
  it('shows the extra sources, read through the container and not from MDBList', async () => {
    const upstream = fakeMdbList(() => ({ status: 200, body: ARRIVAL_RATINGS }));
    const origin = await container({ mdbListApiKey: 'secret-key-42', fetch: upstream.fetch });

    const ratings = await readExtraRatings(movie({ imdb: 'tt2543164' }), { origin });

    expect(ratings).toEqual(ARRIVAL_EXTRAS);
    // The browser asked our own origin; only the container spoke to MDBList,
    // and the key went no further than it (ADR 0004).
    expect(upstream.calls).toEqual([
      'https://api.mdblist.com/imdb/movie/tt2543164/?apikey=secret-key-42',
    ]);
  });

  it('reads one Title once, however often a screen asks for it', async () => {
    const upstream = fakeMdbList(() => ({ status: 200, body: ARRIVAL_RATINGS }));
    const origin = await container({ mdbListApiKey: 'secret-key-42', fetch: upstream.fetch });
    const arrival = movie({ imdb: 'tt2543164' });
    const watched = watchedFetch();

    const [first, second] = await Promise.all([
      readExtraRatings(arrival, { origin, fetch: watched.fetch }),
      readExtraRatings(arrival, { origin, fetch: watched.fetch }),
    ]);
    const third = await readExtraRatings(arrival, { origin, fetch: watched.fetch });

    expect(first).toEqual(ARRIVAL_EXTRAS);
    expect(second).toEqual(ARRIVAL_EXTRAS);
    expect(third).toEqual(ARRIVAL_EXTRAS);
    // One read of the container, not three: a hover card and the title page
    // asking about the same Title cost nothing the second time.
    expect(watched.asked).toHaveLength(1);
  });

  it('reads each Title on its own', async () => {
    const upstream = fakeMdbList(() => ({ status: 200, body: ARRIVAL_RATINGS }));
    const origin = await container({ mdbListApiKey: 'secret-key-42', fetch: upstream.fetch });

    await readExtraRatings(movie({ imdb: 'tt2543164' }), { origin });
    await readExtraRatings(series({ imdb: 'tt11280740' }), { origin });

    expect(upstream.calls).toHaveLength(2);
  });

  it('shows nothing extra for a Title MDBList has never heard of', async () => {
    const upstream = fakeMdbList(() => ({ status: 404, body: { error: 'not found' } }));
    const origin = await container({ mdbListApiKey: 'secret-key-42', fetch: upstream.fetch });

    expect(await readExtraRatings(movie({ imdb: 'tt0000001' }), { origin })).toEqual([]);
  });

  it('degrades silently to the Server’s own ratings when MDBList fails', async () => {
    const upstream = fakeMdbList(() => ({ status: 500, body: { error: 'boom' } }));
    const origin = await container({ mdbListApiKey: 'secret-key-42', fetch: upstream.fetch });

    expect(await readExtraRatings(movie({ imdb: 'tt2543164' }), { origin })).toEqual([]);
  });

  it('asks the container again after a failure, so a blip is not permanent', async () => {
    let answers = 0;
    const upstream = fakeMdbList(() => {
      answers += 1;
      return answers === 1
        ? { status: 500, body: { error: 'boom' } }
        : { status: 200, body: ARRIVAL_RATINGS };
    });
    const origin = await container({ mdbListApiKey: 'secret-key-42', fetch: upstream.fetch });
    const arrival = movie({ imdb: 'tt2543164' });

    expect(await readExtraRatings(arrival, { origin })).toEqual([]);

    expect(await readExtraRatings(arrival, { origin })).toEqual(ARRIVAL_EXTRAS);
  });

  it('degrades silently when the container itself cannot be reached', async () => {
    const origin = await container({ mdbListApiKey: 'secret-key-42' });
    await running?.close();
    running = undefined;

    expect(await readExtraRatings(movie({ imdb: 'tt2543164' }), { origin })).toEqual([]);
  });
});

describe('a User looking at a Title when the host set no MDBList key', () => {
  it('shows nothing extra', async () => {
    const upstream = fakeMdbList(() => ({ status: 200, body: ARRIVAL_RATINGS }));
    const origin = await container({ mdbListApiKey: '', fetch: upstream.fetch });

    expect(await readExtraRatings(movie({ imdb: 'tt2543164' }), { origin })).toEqual([]);
    // Nothing reached MDBList: the container answered for it.
    expect(upstream.calls).toEqual([]);
  });

  it('stops asking at all once the container has said extra ratings are off', async () => {
    const upstream = fakeMdbList(() => ({ status: 200, body: ARRIVAL_RATINGS }));
    const origin = await container({ mdbListApiKey: '', fetch: upstream.fetch });
    const watched = watchedFetch();

    await readExtraRatings(movie({ imdb: 'tt2543164' }), { origin, fetch: watched.fetch });
    await readExtraRatings(series({ imdb: 'tt11280740' }), { origin, fetch: watched.fetch });
    await readExtraRatings(movie({ tmdb: '603' }), { origin, fetch: watched.fetch });

    // There is no capability flag in the runtime config, by design (ADR 0004):
    // one answer of "not configured" is how the app learns there is no key, and
    // it is remembered so a Row of cards does not ask once per card.
    expect(watched.asked).toHaveLength(1);
  });

  it('asks nothing for a Title with no provider id, key or no key', async () => {
    const upstream = fakeMdbList(() => ({ status: 200, body: ARRIVAL_RATINGS }));
    const origin = await container({ mdbListApiKey: 'secret-key-42', fetch: upstream.fetch });
    const watched = watchedFetch();

    expect(await readExtraRatings(movie({}), { origin, fetch: watched.fetch })).toEqual([]);
    expect(watched.asked).toEqual([]);
  });
});
