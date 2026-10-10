import {
  catalogueItemFrom,
  titleDetailsFrom,
  titleOf,
  type TitleDetails,
} from '../catalogue/catalogue';
import { cardForTitle, type RowCard } from '../home/row';
import type { JellyfinGateway } from '../jellyfin/gateway';

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

  return {
    outcome: 'title',
    details,
    page: {
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
