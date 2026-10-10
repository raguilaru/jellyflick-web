import type { FakeRoute } from '../routing.ts';
import { userForToken } from './users.ts';

/**
 * `UserViewController`.
 *
 * In 12.x the libraries a User can see are at `GET /UserViews`, not the legacy
 * `/Users/{userId}/Views`, and they come back as a `BaseItemDtoQueryResult`
 * rather than a bare array.
 */
export const userViewRoutes: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/UserViews',
    handle: (request, state) => {
      // The libraries are the signed-in User's own, so the Server will not list
      // them without a token.
      if (userForToken(request.headers.authorization ?? '', state.users) === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }
      if (state.failLibraryQueriesWith !== null) {
        return {
          status: state.failLibraryQueriesWith,
          body: { error: 'The fake Jellyfin was told to fail library queries.' },
        };
      }
      return {
        status: 200,
        body: {
          Items: state.libraries,
          TotalRecordCount: state.libraries.length,
          StartIndex: 0,
        },
      };
    },
  },
];
