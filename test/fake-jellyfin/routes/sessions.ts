import type { FakeJellyfinState, FakeSession } from '../data.ts';
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
 * The rest is Play On's (#34): `GET /Sessions`, the list of other apps signed
 * in to this Server, and the two command families that drive one of them —
 * `POST /Sessions/{id}/Playing` to start a Title there and
 * `POST /Sessions/{id}/Playing/{command}` to pause, resume or stop it.
 *
 * Those three are the one place this fake lets a **command** change its own
 * state: a `PlayNow` moves `NowPlayingItem` onto the session it was sent to,
 * and a playstate command moves that session's `PlayState`. Everywhere else
 * the fake records a write and answers; here a test has to be able to watch
 * what the *other* app is playing change, because that is the ticket's third
 * acceptance criterion and there is no other way to see it.
 *
 * **Everything on `/Sessions/{id}/Playing` is a query parameter** and there is
 * no body at all (`jellyfin-playback.md` §11) — the one endpoint family on
 * this API shaped that way, and the easiest thing about Play On to get wrong,
 * so both required parameters are refused when missing rather than ignored.
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
    handle: (request, state) =>
      // Starting playback is what the Server counts as a play.
      reportFrom(request, state, { remembersPosition: false, countsAPlay: true }),
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

  /**
   * `GET /Sessions` — the other apps signed in to this Server.
   *
   * `controllableByUserId` is what the real Server filters `SupportsRemoteControl`
   * on, so it is honoured here: a client that asks without it gets everything,
   * which is the real behaviour and not a shortcut. `activeWithinSeconds`
   * drops a session last heard from longer ago than that — the parameter this
   * app sends a figure of its own for.
   *
   * It does **not** leave this device out. The real Server cannot know which
   * session is asking, and that it answers with the caller's own session is
   * exactly why `playOnTargets` filters by DeviceId — a fake that helpfully
   * removed it would hide the bug that filter exists for.
   */
  {
    method: 'GET',
    path: '/Sessions',
    handle: (request, state) => {
      if (userForToken(request.headers.authorization ?? '', state) === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }
      if (state.failSessionsWith !== null) {
        return {
          status: state.failSessionsWith,
          body: { error: 'The fake Jellyfin was told to fail listing sessions.' },
        };
      }

      const controllableBy = request.query.get('controllableByUserId');
      const activeWithin = Number(request.query.get('activeWithinSeconds') ?? '');
      const deviceId = request.query.get('deviceId');
      const now = Date.now();

      const sessions = state.sessions.filter((session) => {
        if (deviceId !== null && session.DeviceId !== deviceId) return false;
        if (controllableBy !== null) {
          if (session.UserId !== controllableBy) return false;
          if (!session.SupportsRemoteControl && !session.SupportsMediaControl) return false;
        }
        if (Number.isFinite(activeWithin) && activeWithin > 0 && session.LastActivityDate !== undefined) {
          const quietFor = (now - Date.parse(session.LastActivityDate)) / 1_000;
          if (quietFor > activeWithin) return false;
        }
        return true;
      });
      return { status: 200, body: sessions };
    },
  },

  /**
   * `POST /Sessions/{sessionId}/Playing` — start a Title on another app.
   *
   * Three segments, like `/Sessions/Playing/Progress`, and they do not collide
   * because the third one here is the literal `Playing`. It takes everything
   * in the **query** and nothing in a body.
   */
  {
    method: 'POST',
    path: '/Sessions/:sessionId/Playing',
    handle: (request, state, params) => {
      const refusal = refusalFor(request, state, params.sessionId ?? '');
      if (refusal !== undefined) return refusal;
      const session = sessionById(state, params.sessionId ?? '');
      if (session === undefined) {
        return { status: 404, body: { error: 'No such session.' } };
      }

      // Both are required on the real endpoint: a play command with no Title
      // and a Title with no command are each half a request.
      const playCommand = request.query.get('playCommand');
      const itemIds = request.query.get('itemIds');
      if (playCommand === null || itemIds === null || itemIds === '') {
        return {
          status: 400,
          body: {
            error:
              'POST /Sessions/{id}/Playing needs playCommand and itemIds as query parameters.',
          },
        };
      }
      if (playCommand !== 'PlayNow') {
        // The other four of the enum are real, and nothing in this app sends
        // them — so a request that did is a bug worth a failure.
        return { status: 400, body: { error: `This fake only plays PlayNow, not ${playCommand}.` } };
      }

      const [first] = itemIds.split(',');
      const item = state.items.find((candidate) => candidate.Id === first);
      session.NowPlayingItem = { Id: first ?? '', ...(item === undefined ? {} : { Name: item.Name }) };
      session.PlayState = {
        IsPaused: false,
        PositionTicks: Number(request.query.get('startPositionTicks') ?? '0') || 0,
      };
      return { status: 204 };
    },
  },

  /**
   * `POST /Sessions/{sessionId}/Playing/{command}` — the transport controls.
   *
   * `Stop` is what Play On's own Stop sends and it leaves the other app idle,
   * which is what makes "nothing is playing there now" something a test can
   * read back. `Seek` is the one command with an argument, and the argument is
   * a query parameter like everything else here.
   */
  {
    method: 'POST',
    path: '/Sessions/:sessionId/Playing/:command',
    handle: (request, state, params) => {
      const refusal = refusalFor(request, state, params.sessionId ?? '');
      if (refusal !== undefined) return refusal;
      const session = sessionById(state, params.sessionId ?? '');
      if (session === undefined) {
        return { status: 404, body: { error: 'No such session.' } };
      }

      const command = params.command ?? '';
      if (!PLAYSTATE_COMMANDS.includes(command)) {
        return { status: 400, body: { error: `${command} is not a PlaystateCommand.` } };
      }

      if (command === 'Stop') {
        session.NowPlayingItem = null;
        session.PlayState = null;
        return { status: 204 };
      }
      const state_ = session.PlayState ?? {};
      if (command === 'Pause') state_.IsPaused = true;
      if (command === 'Unpause') state_.IsPaused = false;
      if (command === 'PlayPause') state_.IsPaused = state_.IsPaused !== true;
      if (command === 'Seek') {
        const ticks = request.query.get('seekPositionTicks');
        if (ticks === null) {
          return { status: 400, body: { error: 'Seek needs seekPositionTicks.' } };
        }
        state_.PositionTicks = Number(ticks) || 0;
      }
      session.PlayState = state_;
      return { status: 204 };
    },
  },
];

/** The whole `PlaystateCommand` enum (`jellyfin-playback.md` §11). */
const PLAYSTATE_COMMANDS: readonly string[] = [
  'Stop',
  'Pause',
  'Unpause',
  'NextTrack',
  'PreviousTrack',
  'Seek',
  'Rewind',
  'FastForward',
  'PlayPause',
];

function sessionById(state: FakeJellyfinState, sessionId: string): FakeSession | undefined {
  return state.sessions.find((session) => session.Id === sessionId);
}

/**
 * What both command routes refuse before they look at anything else: an
 * unauthorised caller, and a Server a test has told to refuse remote control.
 */
function refusalFor(
  request: FakeRequest,
  state: FakeJellyfinState,
  sessionId: string,
): FakeResponse | undefined {
  if (userForToken(request.headers.authorization ?? '', state) === undefined) {
    return { status: 401, body: { error: 'No valid token.' } };
  }
  if (state.failRemoteControlWith !== null) {
    return {
      status: state.failRemoteControlWith,
      body: { error: `The fake Jellyfin was told to refuse controlling ${sessionId}.` },
    };
  }
  return undefined;
}

/**
 * One of the three body-carrying reports. `ItemId` and `PlaySessionId` are
 * required, because a report the Server cannot attribute is worthless — the
 * real one ignores it silently, which would hide a client bug, so this refuses.
 */
function reportFrom(
  request: FakeRequest,
  state: FakeJellyfinState,
  options: { remembersPosition: boolean; countsAPlay?: boolean },
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

  if (options.countsAPlay === true) {
    const counted = state.playCounts[user.Id] ?? {};
    counted[itemId] = (counted[itemId] ?? 0) + 1;
    state.playCounts[user.Id] = counted;
  }

  // Playing something is the only thing that sets `LastPlayedDate` on the real
  // Server, and it is what Continue Watching is ordered by (#12). A test that
  // wants a household with a history seeds `lastPlayedDates` instead.
  const playedAt = state.lastPlayedDates[user.Id] ?? {};
  playedAt[itemId] = new Date().toISOString();
  state.lastPlayedDates[user.Id] = playedAt;

  return { status: 204 };
}
