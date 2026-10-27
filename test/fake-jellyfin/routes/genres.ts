import type { FakeRoute } from '../routing.ts';
import { userForToken } from './users.ts';

/**
 * `GenresController`.
 *
 * `GET /Genres` is the distinct set of genre names across the items the query
 * includes, served as `Genre` items in a `BaseItemDtoQueryResult`. It has no
 * `recursive` parameter: it is already the set across everything the User can
 * see, which is why a client browsing by genre never has to read every Title.
 */
export const genreRoutes: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/Genres',
    handle: (request, state) => {
      // What genres there are is what one User's libraries hold.
      if (userForToken(request.headers.authorization ?? '', state) === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }

      if (state.failLibraryQueriesWith !== null) {
        return {
          status: state.failLibraryQueriesWith,
          body: { error: 'The fake Jellyfin was told to fail library queries.' },
        };
      }

      const includeItemTypes = (request.query.get('includeItemTypes') ?? '')
        .split(',')
        .map((value) => value.trim())
        .filter((value) => value.length > 0);

      const names = new Set<string>();
      for (const item of state.items) {
        if (includeItemTypes.length > 0 && !includeItemTypes.includes(item.Type)) continue;
        for (const genre of item.Genres ?? []) names.add(genre);
      }

      const genres = Array.from(names)
        .sort((left, right) => left.localeCompare(right))
        // A genre is an item in its own right on the real Server, with an id
        // of its own, which is what `genreIds` would take.
        .map((name) => ({ Id: idOf(name), Name: name, Type: 'Genre' }));

      return {
        status: 200,
        body: { Items: genres, TotalRecordCount: genres.length, StartIndex: 0 },
      };
    },
  },
];

/** A genre's own item id, which is what `genreIds` would take. */
function idOf(name: string): string {
  return `genre-${name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
}
