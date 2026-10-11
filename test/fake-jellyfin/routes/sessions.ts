import type { FakeRoute } from '../routing.ts';
import { tokenFromAuthorization, userForToken } from './users.ts';

/**
 * `SessionController`, as far as signing out needs it.
 *
 * `POST /Sessions/Logout` is Jellyfin's "drop the token this request carries" —
 * the SDK calls it `reportSessionEnded`. It takes no parameters: the token in
 * the `Authorization` header is the one it revokes, which is exactly what one
 * of several Users signing out of a device needs, because the other Users'
 * tokens are on their own DeviceIds and have to survive.
 *
 * Everything else on `/Sessions` belongs to progress reporting (#25) and Play
 * On (#34).
 */
export const sessionRoutes: readonly FakeRoute[] = [
  {
    method: 'POST',
    path: '/Sessions/Logout',
    handle: (request, state) => {
      if (state.failSessionLogoutWith !== null) {
        return {
          status: state.failSessionLogoutWith,
          body: { error: 'The fake Jellyfin was told to fail signing out.' },
        };
      }

      const authorization = request.headers.authorization ?? '';
      if (userForToken(authorization, state) === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }

      const token = tokenFromAuthorization(authorization);
      if (token !== undefined && !state.revokedTokens.includes(token)) {
        state.revokedTokens.push(token);
      }
      // The real endpoint answers 204 with no body.
      return { status: 204 };
    },
  },
];
