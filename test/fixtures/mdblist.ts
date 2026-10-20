/**
 * MDBList's real answers, captured once with the host's own key (#45).
 *
 * Until #45 there was no real call to code against: MDBList's own OpenAPI
 * schema types `ratings[]` as a bare object and documents no keys at all
 * (`docs/research/ratings-mdblist.md` §19), so every test wrote the shape it
 * imagined — and one of those guesses was wrong for two tickets. **These two
 * files are the answer itself**, byte for byte apart from the indentation, so
 * the next person reads instead of guessing. What they settled is
 * `docs/research/decisions.md` §15.
 *
 * Both were taken from `GET https://api.mdblist.com/imdb/{movie|show}/{id}/`,
 * the exact route `server/jellyflick-server.ts` proxies. Neither holds the key:
 * MDBList does not echo it, and ADR 0004 keeps it inside the container.
 *
 * The two are deliberately different Titles:
 *
 * - **The Matrix** has a value for every source this app shows, so it is the
 *   fixture for "all four badges are drawn".
 * - **Game of Thrones** has `letterboxd: null` — Letterboxd does not rate
 *   television — so it is the fixture for story 81's "a missing rating is left
 *   out, not shown as a zero".
 *
 * Use them through {@link mdbListRatings} when a test only wants `ratings[]`.
 */
import movie from './mdblist-imdb-movie-tt0133093.json';
import show from './mdblist-imdb-show-tt0944947.json';

/** The Matrix (`imdb/movie/tt0133093`), HTTP 200, captured 2026-10-20. */
export const MDBLIST_MATRIX: unknown = movie;

/** Game of Thrones (`imdb/show/tt0944947`), HTTP 200, captured 2026-10-20. */
export const MDBLIST_GAME_OF_THRONES: unknown = show;

/**
 * One captured answer's `ratings[]`, for a test that wants to hand the array
 * itself to something. The payloads are typed `unknown` on purpose — the whole
 * point of `extraRatingsFrom` is that it trusts no shape — so this is the one
 * place that reads into them.
 */
export function mdbListRatings(payload: unknown): readonly unknown[] {
  const { ratings } = payload as { ratings: readonly unknown[] };
  return ratings;
}
