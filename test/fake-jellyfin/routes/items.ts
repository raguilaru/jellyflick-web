import { servedViewOf, type FakeItem } from '../data.ts';
import type { FakeRoute } from '../routing.ts';
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
    path: '/Items',
    handle: (request, state) => {
      // Whose favourites, whose parental controls: the Server wants a token.
      const user = userForToken(request.headers.authorization ?? '', state.users);
      if (user === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }

      // My List is the only `/Items` query any feature makes so far. Anything
      // else is refused rather than answered with the whole library.
      if (request.query.get('isFavorite') !== 'true') {
        return {
          status: 400,
          body: {
            error:
              'The fake Jellyfin only implements /Items?isFavorite=true. Implement the query your ticket needs in test/fake-jellyfin/routes/items.ts.',
          },
        };
      }

      if (state.failFavouriteQueriesWith !== null) {
        return {
          status: state.failFavouriteQueriesWith,
          body: { error: 'The fake Jellyfin was told to fail favourite queries.' },
        };
      }

      const sortBy = request.query.get('sortBy');
      if (sortBy !== null && sortBy !== 'Name') {
        return {
          status: 400,
          body: {
            error: `The fake Jellyfin only implements sortBy=Name, not ${sortBy}. Implement it in test/fake-jellyfin/routes/items.ts.`,
          },
        };
      }

      const favourites = state.favourites[user.Id] ?? [];
      const kinds = csvOf(request.query.get('includeItemTypes'));
      const descending = request.query.get('sortOrder') === 'Descending';

      const items = state.items
        .filter((item) => favourites.indexOf(item.Id) !== -1)
        .filter((item) => kinds.length === 0 || kinds.indexOf(item.Type) !== -1)
        .sort((left, right) =>
          descending ? right.Name.localeCompare(left.Name) : left.Name.localeCompare(right.Name),
        )
        .slice(0, limitOf(request.query.get('limit')))
        .map(servedViewOf);

      return {
        status: 200,
        body: { Items: items, TotalRecordCount: items.length, StartIndex: 0 },
      };
    },
  },

  {
    method: 'GET',
    path: '/Items/Latest',
    handle: (request, state) => {
      // What is new is new to one User, so the Server wants a token.
      if (userForToken(request.headers.authorization ?? '', state.users) === undefined) {
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

function imageTagOf(item: FakeItem | undefined, imageType: string): string | undefined {
  if (item === undefined) return undefined;
  return item.ImageTags?.[imageType];
}

/** One of Jellyfin's CSV parameters, as the list it stands for. */
function csvOf(raw: string | null): string[] {
  if (raw === null) return [];
  return raw.split(',').filter((value) => value.length > 0);
}

/** Jellyfin's `limit`, which is optional and means "everything" when absent. */
function limitOf(raw: string | null): number {
  if (raw === null) return Number.POSITIVE_INFINITY;
  const limit = Number.parseInt(raw, 10);
  return Number.isNaN(limit) ? Number.POSITIVE_INFINITY : limit;
}
