import type { FakeJellyfinState } from '../data.ts';
import type { FakeRequest, FakeResponse, FakeRoute } from '../routing.ts';
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
 * The four reporting endpoints are #25's: `Playing`, `Playing/Progress`,
 * `Playing/Stopped` and `Playing/Ping`. All four answer **204** and all but the
 * ping take everything in the body — the ping is the odd one out and takes
 * `playSessionId` as a *required query parameter* (`jellyfin-playback.md` §10).
 *
 * `Progress` and `Stopped` write `PositionTicks` into
 * `state.playbackPositions`, which is the resume point `UserData` is then served
 * from, so a test can watch a position arrive and the next Play honour it —
 * which is what the real Server does and the only way that criterion can be
 * checked end to end.
 *
 * Everything else on `/Sessions` belongs to Play On (#34).
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

  {
    method: 'POST',
    path: '/Sessions/Playing',
    handle: (request, state) => reportFrom(request, state, { remembersPosition: false }),
  },
  {
    method: 'POST',
    path: '/Sessions/Playing/Progress',
    handle: (request, state) => reportFrom(request, state, { remembersPosition: true }),
  },
  {
    method: 'POST',
    path: '/Sessions/Playing/Stopped',
    handle: (request, state) => reportFrom(request, state, { remembersPosition: true }),
  },

  {
    method: 'POST',
    path: '/Sessions/Playing/Ping',
    handle: (request, state) => {
      if (userForToken(request.headers.authorization ?? '', state) === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }
      if (state.failPlaybackReportsWith !== null) {
        return {
          status: state.failPlaybackReportsWith,
          body: { error: 'The fake Jellyfin was told to fail playback reports.' },
        };
      }
      // The one reporting endpoint whose argument is a query parameter, and it
      // is required: a ping with no session has nothing to keep alive.
      if (request.query.get('playSessionId') === null) {
        return {
          status: 400,
          body: { error: 'A ping needs playSessionId as a query parameter.' },
        };
      }
      return { status: 204 };
    },
  },
];

/**
 * One of the three body-carrying reports. `ItemId` and `PlaySessionId` are
 * required, because a report the Server cannot attribute is worthless — the
 * real one ignores it silently, which would hide a client bug, so this refuses.
 */
function reportFrom(
  request: FakeRequest,
  state: FakeJellyfinState,
  options: { remembersPosition: boolean },
): FakeResponse {
  const user = userForToken(request.headers.authorization ?? '', state);
  if (user === undefined) {
    return { status: 401, body: { error: 'No valid token.' } };
  }
  if (state.failPlaybackReportsWith !== null) {
    return {
      status: state.failPlaybackReportsWith,
      body: { error: 'The fake Jellyfin was told to fail playback reports.' },
    };
  }

  const body = (request.body ?? {}) as Record<string, unknown>;
  const itemId = body.ItemId;
  if (typeof itemId !== 'string' || itemId === '') {
    return { status: 400, body: { error: 'A playback report needs an ItemId.' } };
  }
  if (typeof body.PlaySessionId !== 'string' || body.PlaySessionId === '') {
    return {
      status: 400,
      body: {
        error:
          'A playback report needs the PlaySessionId from PlaybackInfo: it is what ties a transcode, a session and the resume point together.',
      },
    };
  }

  if (options.remembersPosition && typeof body.PositionTicks === 'number') {
    const forUser = state.playbackPositions[user.Id] ?? {};
    forUser[itemId] = body.PositionTicks;
    state.playbackPositions[user.Id] = forUser;
  }

  return { status: 204 };
}
