import { genresOf } from '../catalogue/catalogue';
import type { JellyfinGateway, TitleKind } from '../jellyfin/gateway';

/**
 * The genres a section makes Rows of (#23): "the User's top genres", derived
 * from the library for that section's kind.
 *
 * It is derived rather than chosen because the Movies and Series sections are
 * **not customisable in v1** — there is no Home Layout behind them, so there
 * is nobody to ask which genres they want. The library answers instead: the
 * genres most of its Movies are in are the genres a household's Movies section
 * should be made of.
 *
 * Every rule here is a pure function of what the Server said. `loadTopGenres`
 * is the one read, and `/Genres` is deliberately not it — see
 * `getGenresOfTitles` in the gateway for why the set of genres cannot answer a
 * question about order.
 */

/**
 * How many genre Rows a section draws. Three, because a section is a handful
 * of Rows a User scrolls past rather than a catalogue of its library: Continue
 * Watching, New on Jellyflick and My List sit above them.
 */
export const TOP_GENRE_ROWS = 3;

/**
 * The genres the most Titles are in, most first.
 *
 * **A tie breaks by name**, deliberately and not by the order the Server
 * happened to answer in: a section whose genre Rows reshuffled between two
 * visits to a library nobody had changed would look like the app guessing.
 * `Array.prototype.sort` is only stable from Chromium 70, one above the floor
 * ADR 0002 sets, so the name is compared outright rather than leaned on.
 */
export function topGenresOf(
  titles: readonly (readonly string[])[],
  rows: number = TOP_GENRE_ROWS,
): readonly string[] {
  const counts = new Map<string, number>();
  for (const genres of titles) {
    for (const genre of genres) {
      counts.set(genre, (counts.get(genre) ?? 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort(([leftName, left], [rightName, right]) =>
      left === right ? leftName.localeCompare(rightName) : right - left,
    )
    .slice(0, rows)
    .map(([genre]) => genre);
}

export type TopGenresOptions = {
  kind: TitleKind;
  rows?: number;
};

/**
 * The section's top genres, read from the Server.
 *
 * **A Server that will not answer leaves the section with no genre Rows**,
 * rather than with a message of its own. Continue Watching and New on
 * Jellyflick are reading the same Server above it and both say so in words
 * already; a third copy of the same news, under a heading the User has never
 * seen because it was never drawn, would be noise rather than information.
 */
export async function loadTopGenres(
  gateway: JellyfinGateway,
  options: TopGenresOptions,
): Promise<readonly string[]> {
  let items;
  try {
    items = await gateway.getGenresOfTitles({ kind: options.kind });
  } catch {
    return [];
  }

  return topGenresOf(items.map(genresOf), options.rows ?? TOP_GENRE_ROWS);
}
