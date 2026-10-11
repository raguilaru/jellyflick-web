import {
  DEFAULT_USER_CONFIGURATION,
  publicViewOf,
  type FakeJellyfinState,
  type FakeUser,
  type FakeUserConfiguration,
} from '../data.ts';
import type { FakeRoute } from '../routing.ts';

/**
 * `UserController` and `UserImageController`.
 *
 * The real Server leaves users whose `UserPolicy.IsHidden` is true out of
 * `/Users/Public`, which is the whole reason the sign-in screen offers a typed
 * username as well. `AuthenticateByName` finds them by name all the same.
 */
export const userRoutes: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/Users/Public',
    handle: (_request, state) => ({
      status: 200,
      body: state.users
        .filter((user) => !user.Policy.IsHidden)
        .map((user) => userDtoFor(user, state)),
    }),
  },

  {
    method: 'POST',
    path: '/Users/AuthenticateByName',
    handle: (request, state) => {
      // The client must identify its device before it has a token: that is how
      // the Server records which device the new token belongs to.
      const authorization = request.headers.authorization ?? '';
      if (!/^MediaBrowser /i.test(authorization)) {
        return { status: 401, body: { error: 'No MediaBrowser authorization header.' } };
      }

      if (state.failAuthenticationWith !== null) {
        return {
          status: state.failAuthenticationWith,
          body: { error: 'The fake Jellyfin was told to fail authentication.' },
        };
      }

      const body = (request.body ?? {}) as { Username?: unknown; Pw?: unknown };
      const username = typeof body.Username === 'string' ? body.Username : '';
      // The field is `Pw`, not `Password`.
      const password = typeof body.Pw === 'string' ? body.Pw : '';

      const user = state.users.find(
        (candidate) => candidate.Name.toLowerCase() === username.toLowerCase(),
      );
      if (user === undefined || user.password !== password) {
        return { status: 401, body: { error: 'Invalid username or password.' } };
      }

      return { status: 200, body: authenticationResultFor(user, request.headers, state) };
    },
  },

  {
    method: 'GET',
    path: '/Users/Me',
    handle: (request, state) => {
      const user = userForToken(request.headers.authorization ?? '', state);
      if (user === undefined) return { status: 401, body: { error: 'No valid token.' } };
      // 12.x has no `GET /Users/Configuration`: a client reads a User's Jellyfin
      // settings from `UserDto.Configuration` here, so this is the endpoint a
      // Server that will not say what they are fails on.
      if (state.failUserConfigurationWith !== null) {
        return {
          status: state.failUserConfigurationWith,
          body: { error: 'The fake Jellyfin was told to fail the User configuration.' },
        };
      }
      return { status: 200, body: userDtoFor(user, state) };
    },
  },

  {
    method: 'POST',
    path: '/Users/Configuration',
    handle: (request, state) => {
      const signedIn = userForToken(request.headers.authorization ?? '', state);
      if (signedIn === undefined) return { status: 401, body: { error: 'No valid token.' } };

      if (state.failUserConfigurationWith !== null) {
        return {
          status: state.failUserConfigurationWith,
          body: { error: 'The fake Jellyfin was told to fail the User configuration.' },
        };
      }

      // The `userId` query parameter overrides the token's User, as it does on
      // the real Server; without one the Server configures whoever is asking.
      const userId = request.query.get('userId') ?? signedIn.Id;
      if (!state.users.some((candidate) => candidate.Id === userId)) {
        return { status: 404, body: { error: `No user ${userId}.` } };
      }

      // The body *replaces* the stored configuration — the real controller
      // assigns the whole `UserConfiguration`, which is what makes a client's
      // read-modify-write load-bearing rather than merely tidy.
      state.userConfiguration[userId] = (request.body ?? {}) as FakeUserConfiguration;
      // 204, as the real endpoint answers: no body.
      return { status: 204, body: undefined };
    },
  },

  {
    method: 'GET',
    path: '/UserImage',
    handle: (request, state) => {
      const userId = request.query.get('userId') ?? '';
      const user = state.users.find((candidate) => candidate.Id === userId);
      if (user === null || user === undefined || user.PrimaryImageTag === null) {
        return { status: 404, body: { error: `No picture for user ${userId}.` } };
      }
      // A JSON body stands in for the bytes: tests assert on the URL an <img>
      // asks for, never on pixels.
      return { status: 200, body: { userId, tag: user.PrimaryImageTag } };
    },
  },
];

/**
 * A user as `UserDto`, with the Jellyfin settings the Server carries on it.
 *
 * A User who has configured nothing still gets the Server's own defaults —
 * absent is not how the real Server answers, and a client must not have to
 * invent them.
 */
function userDtoFor(user: FakeUser, state: Pick<FakeJellyfinState, 'userConfiguration'>) {
  return {
    ...publicViewOf(user),
    Configuration: {
      ...DEFAULT_USER_CONFIGURATION,
      ...(state.userConfiguration[user.Id] ?? {}),
    },
  };
}

function authenticationResultFor(
  user: FakeUser,
  headers: Record<string, string>,
  state: Pick<FakeJellyfinState, 'userConfiguration'>,
) {
  const deviceId = valueFromAuthorization(headers.authorization ?? '', 'DeviceId') ?? 'unknown';
  return {
    User: userDtoFor(user, state),
    // The Server allows one token per DeviceId, so the token is derived from
    // both: a second sign-in on the same DeviceId replaces the first.
    AccessToken: `token-${user.Id}-${deviceId}`,
    ServerId: user.ServerId,
    SessionInfo: { Id: `session-${user.Id}-${deviceId}`, UserId: user.Id, DeviceId: deviceId },
  };
}

/**
 * The user a request's token belongs to, or `undefined` for no usable token.
 *
 * A token the Server has dropped — `POST /Sessions/Logout` — is no longer
 * usable anywhere, which is why this reads the whole state rather than just the
 * users: one User signing out must not be answerable on any endpoint, while the
 * other Users signed in on the device carry on untouched.
 */
export function userForToken(
  authorization: string,
  state: Pick<FakeJellyfinState, 'users' | 'revokedTokens'>,
): FakeUser | undefined {
  const token = tokenFromAuthorization(authorization);
  if (token === undefined) return undefined;
  if (state.revokedTokens.includes(token)) return undefined;
  return state.users.find((user) => token.startsWith(`token-${user.Id}-`));
}

/** The access token a request carries, if it carries one at all. */
export function tokenFromAuthorization(authorization: string): string | undefined {
  return valueFromAuthorization(authorization, 'Token');
}

/** One quoted, URL-encoded value out of a `MediaBrowser …` header. */
export function valueFromAuthorization(authorization: string, key: string): string | undefined {
  const match = new RegExp(`(?:^|[\\s,])${key}="([^"]*)"`).exec(authorization);
  if (match === null) return undefined;
  return decodeURIComponent(match[1] as string);
}
