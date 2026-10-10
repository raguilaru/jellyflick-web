import { catalogueItemFrom, titleOf, type Title } from '../catalogue/catalogue';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { cardForTitle, type RowCard } from '../home/row';

/**
 * Search: what the Server is asked, and what comes back as cards.
 *
 * "Only Movies and Series" is the gateway's doing — every Title query carries
 * `includeItemTypes=Movie,Series`, so nothing else is ever sent. The catalogue
 * is still what reads each item, so a kind the app does not show could not slip
 * through even if the Server sent one.
 */

/** How many matches a search shows. More than a strip holds, fewer than a library. */
export const SEARCH_RESULT_LIMIT = 30;

/**
 * What a search came to. "The Server would not answer" is an outcome rather
 * than a thrown error, because the screen keeps working either way, and an
 * empty result is a different thing again: nothing on this Server matches.
 */
export type TitlesResult =
  | { outcome: 'titles'; titles: readonly RowCard[] }
  | { outcome: 'unavailable' };

export type GenresResult =
  | { outcome: 'genres'; genres: readonly string[] }
  | { outcome: 'unavailable' };

/** The Titles matching a term, as cards. */
export function searchForTitles(
  gateway: JellyfinGateway,
  searchTerm: string,
  limit: number = SEARCH_RESULT_LIMIT,
): Promise<TitlesResult> {
  return titlesFrom(gateway, { searchTerm, limit });
}

/** The Titles in one genre, as cards. */
export function titlesInGenre(
  gateway: JellyfinGateway,
  genre: string,
  limit: number = SEARCH_RESULT_LIMIT,
): Promise<TitlesResult> {
  return titlesFrom(gateway, { genre, limit });
}

/**
 * The genres there are to browse, by name. The Server collects them, so this
 * never reads every Title to find out.
 */
export function loadGenres(gateway: JellyfinGateway): Promise<GenresResult> {
  return gateway
    .getTitleGenres()
    .then((genres) => ({
      outcome: 'genres' as const,
      genres: genres
        .map((genre) => genre.Name)
        .filter((name): name is string => typeof name === 'string' && name !== ''),
    }))
    .catch(() => ({ outcome: 'unavailable' as const }));
}

function titlesFrom(
  gateway: JellyfinGateway,
  options: { searchTerm?: string; genre?: string; limit: number },
): Promise<TitlesResult> {
  return gateway
    .getTitles(options)
    .then((items) => ({
      outcome: 'titles' as const,
      titles: items
        .map((dto) => catalogueItemFrom(dto))
        .filter((item): item is NonNullable<typeof item> => item !== undefined)
        .map((item) => titleOf(item))
        .map((title: Title) => cardForTitle(gateway, title)),
    }))
    .catch(() => ({ outcome: 'unavailable' as const }));
}
