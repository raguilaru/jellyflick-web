import {
  servedCollectionViewOf,
  servedViewOf,
  type FakeItem,
  type FakeJellyfinState,
} from '../data.ts';
import type { FakeRequest, FakeRoute } from '../routing.ts';
import { userForToken } from './users.ts';

/**
 * `ItemsController` and `ImageController`.
 *
 * `/Items/Latest` is the one that shapes the New on Jellyflick Row, and two of
 * its habits matter: it answers for **one** library at a time through
 * `parentId`, and it returns a **bare array**, not a `BaseItemDtoQueryResult`.
 *
 * `/Items` is the general query, and the real one takes thirty-odd parameters.
 * This fake implements the ones a feature actually sends and refuses the rest
 * with a 400 that says so, so an unimplemented parameter can never look like it
 * was honoured.
 */
export const itemRoutes: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/Items/Latest',
    handle: (request, state) => {
      // What is new is new to one User, so the Server wants a token.
      if (userForToken(request.headers.authorization ?? '', state) === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }

      if (state.failLibraryQueriesWith !== null) {
        return {
          status: state.failLibraryQueriesWith,
          body: { error: 'The fake Jellyfin was told to fail library queries.' },
        };
      }

      // The real Server groups Episodes into their Series when asked to. This
      // fake does not: the client asks for `false` and merges several libraries
      // itself, because a Series' place in a Row is its newest Episode's date
      // added and only the client has seen every library. Anything else is
      // refused rather than quietly ignored.
      const groupItems = request.query.get('groupItems');
      if (groupItems !== 'false') {
        return {
          status: 400,
          body: {
            error:
              'The fake Jellyfin only implements groupItems=false. Implement the grouping in test/fake-jellyfin/routes/items.ts if a ticket needs it.',
          },
        };
      }

      const parentId = request.query.get('parentId');
      if (parentId === null || !state.libraries.some((library) => library.Id === parentId)) {
        return { status: 404, body: { error: `No library ${String(parentId)}.` } };
      }

      // The real endpoint answers with the newest playable additions, so a
      // Series and its Seasons are not among them — their Episodes are.
      const latest = state.items
        .filter((item) => item.libraryId === parentId)
        .filter((item) => item.Type !== 'Series' && item.Type !== 'Season')
        .sort((left, right) => Date.parse(right.DateCreated) - Date.parse(left.DateCreated))
        .slice(0, limitOf(request.query.get('limit')))
        .map(servedViewOf);

      return { status: 200, body: latest };
    },
  },

  {
    method: 'GET',
    path: '/Items',
    handle: (request, state) => {
      // A query across the libraries is a query about what one User can see —
      // and `isFavorite` makes it a query about what one User has saved.
      const user = userForToken(request.headers.authorization ?? '', state);
      if (user === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }

      const favouritesOnly = request.query.get('isFavorite') === 'true';
      if (favouritesOnly && state.failFavouriteQueriesWith !== null) {
        return {
          status: state.failFavouriteQueriesWith,
          body: { error: 'The fake Jellyfin was told to fail favourite queries.' },
        };
      }

      if (state.failLibraryQueriesWith !== null) {
        return {
          status: state.failLibraryQueriesWith,
          body: { error: 'The fake Jellyfin was told to fail library queries.' },
        };
      }

      // The real Server answers with the library folders themselves without
      // it, which is never what a client asking for Titles meant.
      if (request.query.get('recursive') !== 'true') {
        return {
          status: 400,
          body: {
            error:
              'The fake Jellyfin only implements recursive=true. Implement the non-recursive form in test/fake-jellyfin/routes/items.ts if a ticket needs it.',
          },
        };
      }

      // Three orders are asked for. `Name` and `SortName` ascending — My List
      // by `Name`, because a client inserting a Title it just added has only
      // the name to place it by, and Search by `SortName`; the real Server
      // falls back to the name when an item has no sort name, and no sample
      // item has one, so here the two are the same order. And `DateCreated`
      // descending, which is what "the newest additions" means (#14). Any
      // other order is refused rather than quietly ignored.
      const sortBy = request.query.get('sortBy') ?? 'Name';
      const sortOrder = request.query.get('sortOrder') ?? 'Ascending';
      const newestFirst = sortBy === 'DateCreated' && sortOrder === 'Descending';
      // `DatePlayed` descending is "when was this last watched", which is what
      // Continue Watching orders a Series by (#12).
      const lastPlayedFirst = sortBy === 'DatePlayed' && sortOrder === 'Descending';
      const byName =
        (sortBy === 'Name' || sortBy === 'SortName') && sortOrder === 'Ascending';
      if (!newestFirst && !lastPlayedFirst && !byName) {
        return {
          status: 400,
          body: {
            error:
              'The fake Jellyfin only implements sortBy=Name or SortName ascending, and sortBy=DateCreated or DatePlayed descending. Implement the order your ticket needs in test/fake-jellyfin/routes/items.ts.',
          },
        };
      }

      const includeItemTypes = csvOf(request.query.get('includeItemTypes'));
      const parentId = request.query.get('parentId');

      // A query for BoxSets is a query for the Collections, which are held
      // beside the items rather than among them — the membership is not a
      // field on an item, so a Collection is not one either. This is how a
      // User is offered the Collections to make a Row of (#15, story 45).
      if (includeItemTypes.length === 1 && includeItemTypes[0] === 'BoxSet') {
        const collections = state.collections
          .filter((collection) => parentId === null || collection.Id === parentId)
          .slice()
          .sort((left, right) => left.Name.localeCompare(right.Name))
          .slice(0, limitOf(request.query.get('limit')))
          .map(servedCollectionViewOf);

        return {
          status: 200,
          body: { Items: collections, TotalRecordCount: collections.length, StartIndex: 0 },
        };
      }

      const searchTerm = request.query.get('searchTerm');
      const genres = csvOf(request.query.get('genres'));
      const ids = csvOf(request.query.get('ids'));
      const favourites = state.favourites[user.Id] ?? [];
      // `isPlayed` is a filter about one User, like `isFavorite` beside it.
      const isPlayed = request.query.get('isPlayed');
      const played = state.played[user.Id] ?? [];

      const matching = state.items
        .filter((item) => ids.length === 0 || ids.includes(item.Id))
        // `parentId` is "inside this folder", and the two folders this Server
        // has are a library and a Collection. A parent it does not have holds
        // nothing, which is a real answer: a Collection deleted on the Server
        // leaves a Row with nothing in it rather than a failure.
        .filter((item) => parentId === null || isInside(state, item, parentId))
        .filter((item) => !favouritesOnly || favourites.includes(item.Id))
        .filter((item) => isPlayed === null || played.includes(item.Id) === (isPlayed === 'true'))
        .filter((item) => includeItemTypes.length === 0 || includeItemTypes.includes(item.Type))
        // The real Server's matching is cleverer than this; a substring of the
        // name is as much as a fake owes a client.
        .filter(
          (item) =>
            searchTerm === null ||
            item.Name.toLowerCase().includes(searchTerm.toLowerCase()),
        )
        .filter(
          (item) => genres.length === 0 || genres.some((genre) => hasGenre(item, genre)),
        )
        .sort((left, right) => {
          if (newestFirst) return Date.parse(right.DateCreated) - Date.parse(left.DateCreated);
          if (lastPlayedFirst) {
            return (
              lastPlayedAtOf(state, user.Id, right.Id) -
              lastPlayedAtOf(state, user.Id, left.Id)
            );
          }
          return left.Name.localeCompare(right.Name);
        })
        .slice(0, limitOf(request.query.get('limit')))
        .map((item) => asAskedFor(item, request, state, user.Id));

      // A query result, not a bare array: `/Items/Latest` is the odd one out.
      return {
        status: 200,
        body: { Items: matching, TotalRecordCount: matching.length, StartIndex: 0 },
      };
    },
  },

  /**
   * `/Items/{itemId}/Similar` — More like this on the title page (#17). Three
   * segments, so it cannot be confused with the two-segment `/Items/Latest`
   * however the routes are ordered; a `/Items/:itemId` route would be the one
   * to watch, and this fake deliberately has none.
   */
  {
    method: 'GET',
    path: '/Items/:itemId/Similar',
    handle: (request, state, params) => {
      const user = userForToken(request.headers.authorization ?? '', state);
      if (user === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }
      if (state.failRelatedQueriesWith !== null) {
        return {
          status: state.failRelatedQueriesWith,
          body: { error: 'The fake Jellyfin was told to fail related queries.' },
        };
      }

      const itemId = params.itemId ?? '';
      if (!state.items.some((item) => item.Id === itemId)) {
        return { status: 404, body: { error: `No item ${itemId}.` } };
      }

      // The relation's own order is the Server's answer, so it is kept rather
      // than sorted: "most like this first" is a real property of the endpoint.
      const like = (state.similar[itemId] ?? [])
        .map((id) => state.items.find((item) => item.Id === id))
        .filter((item): item is FakeItem => item !== undefined)
        .slice(0, limitOf(request.query.get('limit')))
        .map((item) => asAskedFor(item, request, state, user.Id));

      return { status: 200, body: { Items: like, TotalRecordCount: like.length, StartIndex: 0 } };
    },
  },

  /** `/Items/{itemId}/Collections` — the Collections one Title is in (#17). */
  {
    method: 'GET',
    path: '/Items/:itemId/Collections',
    handle: (request, state, params) => {
      if (userForToken(request.headers.authorization ?? '', state) === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }
      if (state.failRelatedQueriesWith !== null) {
        return {
          status: state.failRelatedQueriesWith,
          body: { error: 'The fake Jellyfin was told to fail related queries.' },
        };
      }

      const itemId = params.itemId ?? '';
      const holding = state.collections
        .filter((collection) => collection.itemIds.includes(itemId))
        .map(servedCollectionViewOf);

      return {
        status: 200,
        body: { Items: holding, TotalRecordCount: holding.length, StartIndex: 0 },
      };
    },
  },

  {
    method: 'GET',
    path: '/Items/:itemId/Images/:imageType',
    handle: (_request, state, params) => {
      const itemId = params.itemId ?? '';
      const imageType = params.imageType ?? '';
      const item = state.items.find((candidate) => candidate.Id === itemId);
      const tag = imageTagOf(item, imageType);
      if (tag === undefined) {
        return { status: 404, body: { error: `No ${imageType} image for item ${itemId}.` } };
      }
      // A JSON body stands in for the bytes, as `/UserImage` does: tests assert
      // on the URL an <img> asks for, never on pixels.
      return { status: 200, body: { itemId, imageType, tag } };
    },
  },
];

/**
 * The properties the real Server only sends when `fields` names them. Verified
 * against `DtoService.cs` (see `docs/research/jellyfin-api.md` §4): the ratings,
 * `RunTimeTicks` and `ProductionYear` are *not* among them — they are always
 * sent — and `UserData` is `enableUserData`'s rather than a field's.
 *
 * Gating them here is what catches a query that forgot to ask: a client reading
 * `Overview` off a Row's items would otherwise work against the fake and show
 * nothing against a real Server.
 */
const GATED_BY_FIELDS: Readonly<Record<string, keyof FakeItem>> = {
  Overview: 'Overview',
  People: 'People',
  MediaStreams: 'MediaStreams',
  ProviderIds: 'ProviderIds',
  // What a Title Label is derived from (#14), and what merging the libraries
  // needs (#4). A query that forgot to ask for it would otherwise see dates
  // here and none at all from a real Server.
  DateCreated: 'DateCreated',
};

/**
 * One item as the query asked for it: the `fields` properties it named, the
 * image types it enabled, and this User's own `UserData` unless it turned that
 * off. `Genres` is deliberately not gated — the Server does gate it, and every
 * query this app makes asks for it, so gating it here would only add noise.
 */
export function asAskedFor(
  item: FakeItem,
  request: FakeRequest,
  state: FakeJellyfinState,
  userId: string,
): Record<string, unknown> {
  const fields = csvOf(request.query.get('fields'));
  const dto: Record<string, unknown> = { ...servedViewOf(item) };

  for (const [field, property] of Object.entries(GATED_BY_FIELDS)) {
    if (!fields.includes(field)) delete dto[property];
  }

  // `enableImages=false` is the Server sending no artwork at all, which a query
  // whose answer is only read for dates asks for (#14).
  if (request.query.get('enableImages') === 'false') {
    delete dto.ImageTags;
    delete dto.BackdropImageTags;
    delete dto.SeriesPrimaryImageTag;
  }

  // Omitted means every image type, which is the real Server's default.
  const imageTypes = csvOf(request.query.get('enableImageTypes'));
  if (imageTypes.length > 0) {
    if (!imageTypes.includes('Backdrop')) delete dto.BackdropImageTags;
    const tags = item.ImageTags;
    if (tags !== undefined) {
      const kept = Object.entries(tags).filter(([type]) => imageTypes.includes(type));
      dto.ImageTags = Object.fromEntries(kept);
    }
  }

  // Omitted means true, which is also the real Server's default.
  if (request.query.get('enableUserData') === 'false') {
    delete dto.UserData;
  } else {
    dto.UserData = userDataFor(item, state, userId);
  }

  return dto;
}

/**
 * One item's `UserItemDataDto` for one User, as the real Server composes it.
 *
 * Shared, because three endpoints serve it — `/Items`, `/UserItems/Resume` and
 * `/Shows/NextUp` — and a Row ordered by `LastPlayedDate` from one and a
 * progress bar drawn from `PlayedPercentage` on another must not be able to
 * disagree.
 *
 * `PlayedPercentage` is sent only where there is something to be a percentage
 * of: the real Server works it out from the position and the runtime, and
 * leaves it out for an item nobody has started.
 */
export function userDataFor(
  item: FakeItem,
  state: FakeJellyfinState,
  userId: string,
): Record<string, unknown> {
  const positionTicks = state.playbackPositions[userId]?.[item.Id] ?? 0;
  const lastPlayedDate = state.lastPlayedDates[userId]?.[item.Id];
  const played = (state.played[userId] ?? []).includes(item.Id);

  return {
    Key: item.Id,
    ItemId: item.Id,
    Played: played,
    IsFavorite: (state.favourites[userId] ?? []).includes(item.Id),
    // What the Server counted, not something worked out from the resume point:
    // clearing a position must not change how many times a User has played
    // something (story 37).
    PlayCount: state.playCounts[userId]?.[item.Id] ?? (played ? 1 : 0),
    // Where this User got to, which is the resume point (#25). The real
    // Server sends 0 for an item nobody has started, never nothing.
    PlaybackPositionTicks: positionTicks,
    ...(positionTicks > 0 && item.RunTimeTicks !== undefined && item.RunTimeTicks > 0
      ? { PlayedPercentage: (positionTicks / item.RunTimeTicks) * 100 }
      : {}),
    ...(lastPlayedDate === undefined ? {} : { LastPlayedDate: lastPlayedDate }),
  };
}

/** When this User last played an item, as a timestamp. Zero for never. */
export function lastPlayedAtOf(
  state: FakeJellyfinState,
  userId: string,
  itemId: string,
): number {
  const date = state.lastPlayedDates[userId]?.[itemId];
  return date === undefined ? 0 : Date.parse(date);
}

function imageTagOf(item: FakeItem | undefined, imageType: string): string | undefined {
  if (item === undefined) return undefined;
  return item.ImageTags?.[imageType];
}

/** A comma-delimited query parameter, which is how Jellyfin takes every list. */
function csvOf(raw: string | null): string[] {
  if (raw === null) return [];
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
}

/**
 * Whether an item is inside a parent, which on this Server is either a library
 * or a Collection. A parent that is neither contains nothing at all.
 */
function isInside(state: FakeJellyfinState, item: FakeItem, parentId: string): boolean {
  if (item.libraryId === parentId) return true;
  const collection = state.collections.find((candidate) => candidate.Id === parentId);
  return collection !== undefined && collection.itemIds.includes(item.Id);
}

function hasGenre(item: FakeItem, genre: string): boolean {
  return (item.Genres ?? []).some((candidate) => candidate.toLowerCase() === genre.toLowerCase());
}

/** Jellyfin's `limit`, which is optional and means "everything" when absent. */
function limitOf(raw: string | null): number {
  if (raw === null) return Number.POSITIVE_INFINITY;
  const limit = Number.parseInt(raw, 10);
  return Number.isNaN(limit) ? Number.POSITIVE_INFINITY : limit;
}
