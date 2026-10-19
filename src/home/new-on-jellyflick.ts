import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { catalogueItemFrom, titleOf, type Title } from '../catalogue/catalogue';
import type { JellyfinGateway, TitleKind } from '../jellyfin/gateway';
import { cardForTitle, type RowCard } from './row';

/**
 * New on Jellyflick: the newest Titles across all libraries, newest first, with
 * each Series shown once however many Episodes were added.
 *
 * The Server has no endpoint for "newest across everything": `/Items/Latest`
 * answers for one library at a time, so the Row asks each library and merges
 * the answers here. The merging is deliberately ours rather than the Server's
 * `groupItems`, because a Series' place in the Row is its newest Episode's date
 * added, and that is only knowable once every library has answered.
 */

/** How many Titles the Row shows. */
export const NEW_ON_JELLYFLICK_LIMIT = 20;

/**
 * The libraries that can hold a Title. A library of mixed content has no
 * `CollectionType` at all, and is asked: it may hold Movies and Series too.
 */
const LIBRARIES_WITH_TITLES = ['movies', 'tvshows'];

export type NewOnJellyflickOptions = {
  limit?: number;
  /**
   * One kind only, for the Movies or Series section. It narrows what the
   * **merge** came to, and deliberately neither the Server's
   * `includeItemTypes` nor which libraries are asked.
   *
   * Not `includeItemTypes`, because `/Items/Latest` answers with what was
   * *added*, which for a Series is an Episode: asking the Server for Series
   * would answer nothing at all. Which Title an addition stands for is the
   * merge's own rule, so the kind is read off that Title.
   *
   * Not the libraries either, however tempting the saved round trip is: a
   * library's `CollectionType` says what it is *for*, not what it holds. The
   * sample Server's own Kids library is typed `movies` and holds Bluey, and a
   * Series section that trusted the type would have left it out.
   */
  kind?: TitleKind;
};

/**
 * What the Row came to. "The Server would not answer" is an outcome rather than
 * a failure, because Home shows the rest of itself either way; an empty Row is
 * a different thing again, and says the libraries hold no Titles yet.
 */
export type NewOnJellyflickResult =
  | { outcome: 'row'; titles: readonly RowCard[] }
  | { outcome: 'unavailable' };

/**
 * Reads the Row from the Server: every library that can hold Titles, asked at
 * once, then merged.
 *
 * A library that will not answer is left out rather than taken as an empty one,
 * so one unreadable library does not quietly shorten the Row. Only a Server that
 * will not say what libraries there are makes the whole Row unavailable.
 */
export async function loadNewOnJellyflick(
  gateway: JellyfinGateway,
  options: NewOnJellyflickOptions = {},
): Promise<NewOnJellyflickResult> {
  const limit = options.limit ?? NEW_ON_JELLYFLICK_LIMIT;
  let libraries;
  try {
    libraries = await gateway.getUserViews();
  } catch {
    return { outcome: 'unavailable' };
  }

  const asked = libraries
    .filter(holdsTitles)
    .map((library) => library.Id)
    .filter((id): id is string => typeof id === 'string' && id !== '');

  const latest = await Promise.all(
    // One library's silence is not the Row's: an empty answer stands in for it.
    asked.map((parentId) => gateway.getLatestItems({ parentId, limit }).catch(() => [])),
  );

  const merged = mergeNewOnJellyflick(latest, limit).filter(
    (title) => options.kind === undefined || title.kind === options.kind,
  );
  return {
    outcome: 'row',
    titles: merged.map((title) => cardForTitle(gateway, title)),
  };
}

function holdsTitles(library: BaseItemDto): boolean {
  const collectionType = library.CollectionType;
  // A library of mixed content has no `CollectionType` at all, and may hold
  // Movies and Series among the rest, so it is asked.
  if (typeof collectionType !== 'string') return true;
  return LIBRARIES_WITH_TITLES.indexOf(collectionType) !== -1;
}

/**
 * Merges each library's latest items into one Row.
 *
 * Takes what the libraries came back with, in any order: Movies and Series
 * stand for themselves, a Season or an Episode stands for its Series, and
 * everything else is dropped. A Series keeps the place of the newest item that
 * stood for it.
 */
export function mergeNewOnJellyflick(
  libraries: readonly (readonly BaseItemDto[])[],
  limit: number = NEW_ON_JELLYFLICK_LIMIT,
): readonly Title[] {
  /** The newest addition seen for each Title, by the Title's own item id. */
  const newest = new Map<string, { title: Title; addedAt: number }>();

  for (const library of libraries) {
    for (const dto of library) {
      const item = catalogueItemFrom(dto);
      if (item === undefined) continue;
      const title = titleOf(item);
      // An item the Server dated not at all sorts last rather than first.
      const addedAt = item.addedAt ?? Number.NEGATIVE_INFINITY;

      const seen = newest.get(title.itemId);
      if (seen === undefined) {
        newest.set(title.itemId, { title, addedAt });
        continue;
      }
      if (addedAt > seen.addedAt) {
        // The same Series reached through a newer Episode: keep the newer date,
        // and the Title that came with it, which may carry artwork the first
        // one did not.
        newest.set(title.itemId, { title: preferWithArtwork(seen.title, title), addedAt });
      }
    }
  }

  return Array.from(newest.values())
    .sort((left, right) => right.addedAt - left.addedAt)
    .slice(0, limit)
    .map((entry) => entry.title);
}

/**
 * The same Title twice, keeping whichever has artwork. Jellyfin fills
 * `SeriesPrimaryImageTag` on some children and not others, so two Episodes of
 * one Series can disagree about whether it has a picture.
 */
function preferWithArtwork(seen: Title, found: Title): Title {
  return found.artwork === undefined && seen.artwork !== undefined ? seen : found;
}
