import { servedViewOf, type FakeItem } from '../data.ts';
import type { FakeRoute } from '../routing.ts';
import { userForToken } from './users.ts';

/**
 * `LibraryController` and `ImageController`.
 *
 * `/Items/Latest` is the one that shapes the New on Jellyflick Row, and two of
 * its habits matter: it answers for **one** library at a time through
 * `parentId`, and it returns a **bare array**, not a `BaseItemDtoQueryResult`.
 */
export const itemRoutes: readonly FakeRoute[] = [
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
    path: '/Items',
    handle: (request, state) => {
      // A query across the libraries is a query about what one User can see.
      if (userForToken(request.headers.authorization ?? '', state.users) === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
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

      const includeItemTypes = csvOf(request.query.get('includeItemTypes'));
      const searchTerm = request.query.get('searchTerm');
      const genres = csvOf(request.query.get('genres'));

      const matching = state.items
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
        .sort((left, right) => left.Name.localeCompare(right.Name))
        .slice(0, limitOf(request.query.get('limit')))
        .map(servedViewOf);

      // A query result, not a bare array: `/Items/Latest` is the odd one out.
      return {
        status: 200,
        body: { Items: matching, TotalRecordCount: matching.length, StartIndex: 0 },
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

function hasGenre(item: FakeItem, genre: string): boolean {
  return (item.Genres ?? []).some((candidate) => candidate.toLowerCase() === genre.toLowerCase());
}

/** Jellyfin's `limit`, which is optional and means "everything" when absent. */
function limitOf(raw: string | null): number {
  if (raw === null) return Number.POSITIVE_INFINITY;
  const limit = Number.parseInt(raw, 10);
  return Number.isNaN(limit) ? Number.POSITIVE_INFINITY : limit;
}
