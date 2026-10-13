import {
  catalogueItemFrom,
  titleDetailsFrom,
  titleOf,
  type TitleDetails,
} from '../catalogue/catalogue';
import { cardForTitle, type RowCard } from '../home/row';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { loadSeries, NO_SERIES, type SeriesPage } from './series';

/**
 * What a title page is, apart from how it looks: its address, and reading one
 * Title's page off the Server.
 *
 * **The address is not a section.** `/title/:itemId` has its own `<Route>` in
 * the shell and no place in either navigation bar, the same call #10 made for
 * `/settings/home-layout`: a title page is reached from a card, never from a
 * bar, and putting it in `SECTIONS` would put it in both. `SECTIONS` is still
 * the one list of sections.
 *
 * It *is* a real address, so a title page can be bookmarked, shared and
 * reloaded, and Back closes it because Back is the browser's back button
 * everywhere in this app (`src/shell/back.ts`).
 */

/** The route pattern, as `preact-iso` takes a path parameter. */
export const TITLE_PATH = '/title/:itemId';

/** One Title's address. The one place a title page's address is written. */
export function titlePathFor(titleId: string): string {
  return `/title/${encodeURIComponent(titleId)}`;
}

/**
 * What the page came to.
 *
 * "The Server would not say" and "that is not a Title" are different answers
 * and are told apart: one is a problem with the Server and the other is a
 * perfectly healthy Server saying no. A hand-typed address for an Episode, a
 * Season or an album is the second — the gateway's `includeItemTypes` keeps
 * those out, so the page never has to decide for itself what the app shows.
 */
export type TitlePageResult =
  | { outcome: 'title'; details: TitleDetails; page: TitlePageExtras }
  | { outcome: 'not-found' }
  | { outcome: 'unavailable' };

/**
 * The Rows and names around the Title itself. They are read beside it rather
 * than inside `TitleDetails`, because they come from endpoints of their own and
 * a Server that will not answer them should not cost the User the page.
 */
export type TitlePageExtras = {
  /** `/Items/{id}/Similar`, as cards. Empty when the Server knows of none. */
  readonly similar: readonly RowCard[];
  /** The names of the Collections the Title is in. Empty when it is in none. */
  readonly collections: readonly string[];
  /**
   * The Seasons and Episodes under a Series (#18), and {@link NO_SERIES} for a
   * Movie — a Movie has none, and asking the Server for the Seasons of one
   * would be a question about a shape it is not.
   */
  readonly series: SeriesPage;
};

/**
 * Reads one Title's page from the Server: the Title itself, the Titles like it
 * and the Collections it is in, asked for at once.
 *
 * Only the Title itself can make the page fail. More like this and the
 * Collection are each left out when the Server will not answer for them, the
 * way one unreadable library does not cost Home its Row.
 */
export async function loadTitlePage(
  gateway: JellyfinGateway,
  titleId: string,
): Promise<TitlePageResult> {
  const [found, similar, collections] = await Promise.all([
    gateway
      .getTitles({ ids: [titleId], detail: true })
      .then((items) => ({ items }))
      .catch(() => undefined),
    gateway.getSimilarTitles({ itemId: titleId, limit: SIMILAR_LIMIT }).catch(() => []),
    gateway.getCollectionsFor(titleId).catch(() => []),
  ]);

  if (found === undefined) return { outcome: 'unavailable' };

  const dto = found.items[0];
  const details = dto === undefined ? undefined : titleDetailsFrom(dto);
  // A Server that answered and had nothing to say is not a Server that failed:
  // the id is for something this app does not show, or for nothing at all.
  if (details === undefined) return { outcome: 'not-found' };

  // The Seasons and Episodes are asked for **after** the Title and not beside
  // it, because only the Title says whether this is a Series at all: asking a
  // Server for the Seasons of a Movie is a question about a shape it is not,
  // and it would answer every Movie's page with a 404 to swallow. One extra
  // round trip on a Series' page is the price, and a Movie's page makes no
  // request it has no use for.
  const series =
    details.title.kind === 'Series' ? await loadSeries(gateway, titleId) : NO_SERIES;

  return {
    outcome: 'title',
    details,
    page: {
      series,
      similar: similar
        .map((item) => {
          const found = catalogueItemFrom(item);
          return found === undefined ? undefined : titleOf(found);
        })
        .filter((title): title is NonNullable<typeof title> => title !== undefined)
        // One card mapping for every Row in the app (#24): the artwork URL is
        // built the same way and at the same width wherever a card appears.
        .map((title) => cardForTitle(gateway, title)),
      collections: collections
        .map((collection) => collection.Name)
        .filter((name): name is string => typeof name === 'string' && name !== ''),
    },
  };
}

/** How many Titles More like this shows: a Row's worth, as Home's Rows are. */
export const SIMILAR_LIMIT = 20;
