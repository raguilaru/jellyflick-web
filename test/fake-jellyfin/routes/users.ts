import { publicViewOf, type FakeUser } from '../data.ts';
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
      body: state.users.filter((user) => !user.Policy.IsHidden).map(publicViewOf),
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

      return { status: 200, body: authenticationResultFor(user, request.headers) };
    },
  },

  {
    method: 'GET',
    path: '/Users/Me',
    handle: (request, state) => {
      const user = userForToken(request.headers.authorization ?? '', state.users);
      if (user === undefined) return { status: 401, body: { error: 'No valid token.' } };
      return { status: 200, body: publicViewOf(user) };
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

function authenticationResultFor(user: FakeUser, headers: Record<string, string>) {
  const deviceId = valueFromAuthorization(headers.authorization ?? '', 'DeviceId') ?? 'unknown';
  return {
    User: publicViewOf(user),
    // The Server allows one token per DeviceId, so the token is derived from
    // both: a second sign-in on the same DeviceId replaces the first.
    AccessToken: `token-${user.Id}-${deviceId}`,
    ServerId: user.ServerId,
    SessionInfo: { Id: `session-${user.Id}-${deviceId}`, UserId: user.Id, DeviceId: deviceId },
  };
}

function userForToken(authorization: string, users: readonly FakeUser[]): FakeUser | undefined {
  const token = valueFromAuthorization(authorization, 'Token');
  if (token === undefined) return undefined;
  return users.find((user) => token.startsWith(`token-${user.Id}-`));
}

/** One quoted, URL-encoded value out of a `MediaBrowser …` header. */
export function valueFromAuthorization(authorization: string, key: string): string | undefined {
  const match = new RegExp(`(?:^|[\\s,])${key}="([^"]*)"`).exec(authorization);
  if (match === null) return undefined;
  return decodeURIComponent(match[1] as string);
}
