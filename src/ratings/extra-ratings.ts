import type { TitleDetails } from '../catalogue/catalogue';

/**
 * The extra ratings a host's MDBList key buys (#20, stories 80–82): Rotten
 * Tomatoes' audience score, Metacritic, Letterboxd and Trakt, beside the
 * Rotten Tomatoes critic score and community score the Server already sends.
 *
 * **It never talks to MDBList.** ADR 0004 keeps the host's key inside the
 * container, which proxies MDBList and caches per Title so one household shares
 * one daily quota, so this module reads the container's own route —
 * `GET /api/ratings/:provider/:type/:id`, documented in `docs/architecture.md`.
 * There is deliberately no capability flag in the runtime config to check
 * first: the config carries the Server address and the app version and nothing
 * else, so no secret can leak into it. The route's 503 is how the app learns
 * there is no key, and that answer is remembered (see {@link readExtraRatings}).
 *
 * **Anything but a 200 means no extra ratings**, and so does an answer whose
 * shape is not the one expected: story 81 wants a missing rating left out, not
 * shown as a zero or a blank, and the page still has the Server's own ratings.
 * MDBList's OpenAPI schema types `ratings[]` as a bare object and documents no
 * keys at all (`docs/research/ratings-mdblist.md` §19), which is exactly why
 * {@link extraRatingsFrom} skips what it does not recognise rather than trusting
 * a shape.
 */

/** The sources this app shows, by MDBList's own identifier for each. */
export const EXTRA_RATING_SOURCES = ['audience', 'metacritic', 'letterboxd', 'trakt'] as const;

export type ExtraRatingSource = (typeof EXTRA_RATING_SOURCES)[number];

/** One source's score for one Title. */
export type ExtraRating = {
  readonly source: ExtraRatingSource;
  /** On that source's own scale — see {@link SOURCE_SCALES}. */
  readonly value: number;
};

/**
 * The scale each source publishes its score on, which is also how a value is
 * checked. A number outside its source's range is treated as absent rather than
 * shown: the shape of `ratings[]` is undocumented, so a scale that turns out to
 * be wrong omits a rating (story 81's own behaviour) instead of showing a
 * nonsense one.
 */
export const SOURCE_SCALES: Readonly<Record<ExtraRatingSource, { readonly outOf: number }>> = {
  // Percentages, as both sites publish them.
  audience: { outOf: 100 },
  metacritic: { outOf: 100 },
  // Letterboxd is stars out of five.
  letterboxd: { outOf: 5 },
  // Trakt publishes a percentage.
  trakt: { outOf: 100 },
};

/** Which Title MDBList is asked about, in its own path's vocabulary. */
export type RatingsLookup = {
  /** `imdb` where there is an IMDb id, `tmdb` otherwise. */
  readonly provider: 'imdb' | 'tmdb';
  /** Jellyfin's `Movie` is MDBList's `movie`, and a `Series` is a `show`. */
  readonly mediaType: 'movie' | 'show';
  readonly id: string;
};

/**
 * The container's route takes `[A-Za-z0-9]{1,32}` and answers 400 on anything
 * else, so an id it could not carry is not worth a request. The same guard
 * keeps a Server-supplied id out of a URL path, whatever a Server put in it.
 */
const USABLE_ID = /^[A-Za-z0-9]{1,32}$/;

/**
 * What to ask MDBList about one Title, or `undefined` when there is nothing to
 * ask: plenty of Titles in a household library have no provider id at all.
 *
 * IMDb is preferred over TMDb because it is the id MDBList indexes best
 * (`docs/research/ratings-mdblist.md` §19).
 */
export function ratingsLookupFor(details: TitleDetails): RatingsLookup | undefined {
  const mediaType = details.title.kind === 'Series' ? 'show' : 'movie';
  const { imdb, tmdb } = details.providerIds;
  if (imdb !== undefined && USABLE_ID.test(imdb)) return { provider: 'imdb', mediaType, id: imdb };
  if (tmdb !== undefined && USABLE_ID.test(tmdb)) return { provider: 'tmdb', mediaType, id: tmdb };
  return undefined;
}

/**
 * MDBList's answer as the ratings this app shows, in the order it listed them.
 *
 * Every rating is read defensively and skipped rather than defaulted:
 *
 * - a source the app does not show, which includes the two the Server already
 *   sends — `tomatoes` is `CriticRating` and `imdb` is `CommunityRating`, and
 *   two numbers for one thing is worse than one
 * - a source with no number on it, which is what MDBList sends for a source it
 *   has no value from
 * - a number off its source's own scale, which is a shape this app guessed
 *   wrong rather than a rating a User should see
 * - a second rating from a source already read, keeping MDBList's own first
 */
export function extraRatingsFrom(payload: unknown): readonly ExtraRating[] {
  const listed = (payload as { ratings?: unknown } | null | undefined)?.ratings;
  if (!Array.isArray(listed)) return [];

  const ratings: ExtraRating[] = [];
  const seen = new Set<ExtraRatingSource>();
  for (const entry of listed as readonly unknown[]) {
    const rating = extraRatingOf(entry);
    if (rating === undefined || seen.has(rating.source)) continue;
    seen.add(rating.source);
    ratings.push(rating);
  }
  return ratings;
}

function extraRatingOf(entry: unknown): ExtraRating | undefined {
  if (typeof entry !== 'object' || entry === null) return undefined;
  const { source, value } = entry as { source?: unknown; value?: unknown };
  if (typeof source !== 'string') return undefined;
  if (!(EXTRA_RATING_SOURCES as readonly string[]).includes(source)) return undefined;
  const known = source as ExtraRatingSource;
  if (typeof value !== 'number' || !Number.isFinite(value)) return undefined;
  if (value <= 0 || value > SOURCE_SCALES[known].outOf) return undefined;
  return { source: known, value };
}

export type ReadExtraRatingsOptions = {
  /**
   * Where the container is. Empty — the default — is the app's own origin,
   * which is what the image serves. A test points it at a server of its own.
   */
  readonly origin?: string;
  /** The HTTP seam, so a test can watch what was asked for. */
  readonly fetch?: typeof globalThis.fetch;
};

/**
 * One Title's extra ratings, and an empty list for every way there are none:
 * no provider id, no key on the host, a Title MDBList has never heard of, an
 * MDBList that failed, a container that could not be reached, or an answer in a
 * shape this app does not recognise. Story 80 treats them as an optional extra
 * and story 81 leaves a missing rating out, so there is nothing to report.
 *
 * **Results are cached per Title**, and so is "there is no key". The container
 * caches per Title too, for the whole household; this cache is the browser's
 * own, so a title page re-read and a hover card over the same Title (#21) cost
 * one request between them rather than one each. A *failure* is not cached, so
 * a blip does not switch a Title's ratings off for as long as the tab is open —
 * the container makes the same distinction for the same reason.
 */
export async function readExtraRatings(
  details: TitleDetails,
  options: ReadExtraRatingsOptions = {},
): Promise<readonly ExtraRating[]> {
  const lookup = ratingsLookupFor(details);
  if (lookup === undefined) return NONE;

  const origin = options.origin ?? '';
  if (withoutAKey.has(origin)) return NONE;

  const key = `${origin}|${lookup.provider}/${lookup.mediaType}/${lookup.id}`;
  const remembered = readings.get(key);
  if (remembered !== undefined) return orNothing(await remembered);

  const reading = read(origin, lookup, options.fetch ?? globalThis.fetch);
  readings.set(key, reading);
  const answer = await reading;
  // A failure is forgotten rather than remembered, so the next screen that
  // wants this Title asks again instead of showing nothing for the whole visit.
  if (answer === 'failed') readings.delete(key);
  return orNothing(answer);
}

function orNothing(answer: readonly ExtraRating[] | 'failed'): readonly ExtraRating[] {
  return answer === 'failed' ? NONE : answer;
}

const NONE: readonly ExtraRating[] = [];

/**
 * What has been read, per origin and per Title, as the promise rather than its
 * answer: a Row of cards appearing at once then shares one request instead of
 * starting one each before the first lands. A promise that failed is taken out
 * again, so only answers are remembered.
 */
const readings = new Map<string, Promise<readonly ExtraRating[] | 'failed'>>();

/**
 * The origins whose container answered "no key configured". Remembered because
 * there is no capability flag to ask first (ADR 0004), and asking once per
 * Title would be a request per card on a host that has no MDBList key at all.
 */
const withoutAKey = new Set<string>();

/**
 * One read of the container's route. `'failed'` is the container or MDBList
 * failing, which is the one answer worth asking again for; every other way of
 * having no ratings — no key, a Title MDBList has never heard of, an answer in
 * a shape this app does not know — is a real answer and is remembered.
 */
async function read(
  origin: string,
  lookup: RatingsLookup,
  fetchFrom: typeof globalThis.fetch,
): Promise<readonly ExtraRating[] | 'failed'> {
  const address = `${origin}/api/ratings/${lookup.provider}/${lookup.mediaType}/${lookup.id}`;

  let response: Response;
  try {
    response = await fetchFrom(address, { headers: { Accept: 'application/json' } });
  } catch {
    // The container could not be reached. The page still has the Server's own
    // ratings, so there is nothing to say to the User.
    return 'failed';
  }

  if (response.status === 503) {
    // The host left `MDBLIST_API_KEY` empty: extra ratings are off everywhere,
    // not just for this Title.
    withoutAKey.add(origin);
    return NONE;
  }
  // 502 is MDBList having failed or being unreachable, which the container
  // deliberately does not cache either.
  if (response.status === 502) return 'failed';
  // A 404 is MDBList saying it has never heard of the Title, which is an answer
  // and stays one: the container caches it to spare the daily quota.
  if (response.status !== 200) return NONE;

  try {
    return extraRatingsFrom(await response.json());
  } catch {
    return NONE;
  }
}
