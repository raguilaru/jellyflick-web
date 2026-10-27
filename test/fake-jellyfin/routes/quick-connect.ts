import type { FakeQuickConnectRequest } from '../data.ts';
import { publicViewOf } from '../data.ts';
import type { FakeRoute } from '../routing.ts';
import { userForToken, valueFromAuthorization } from './users.ts';

/**
 * `QuickConnectController`, plus the one `/Users` route that belongs to the
 * same flow.
 *
 * Four endpoints are the flow as 12.2.0 has it
 * (`docs/research/jellyfin-api.md` §2), and the fifth is the *approving* side,
 * which another Jellyfin app calls and Jellyflick never does:
 *
 * 1. `GET  /QuickConnect/Enabled`
 * 2. `POST /QuickConnect/Initiate`           — the device being signed in
 * 3. `GET  /QuickConnect/Connect?secret=`    — the same device, polling
 * 4. `POST /Users/AuthenticateWithQuickConnect` — `{ Secret }`
 * 5. `POST /QuickConnect/Authorize?code=&userId=` — the other app
 *
 * Two things here are the Server's real behaviour and are what the client has
 * to be built against:
 *
 * - **The token belongs to the device that initiated**, not to the one that
 *   approved. The request remembers the DeviceId from the `Authorization`
 *   header on `Initiate`, and `AuthenticateWithQuickConnect` issues the token
 *   against that — which is why Jellyflick has to mint its DeviceId before
 *   initiating and keep it.
 * - **A spent request is gone.** Exchanging a secret removes it, so polling
 *   afterwards is a 404 — the same answer an expired or withdrawn request
 *   gives. The client cannot tell those apart, and nor can any other client.
 */
export const quickConnectRoutes: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/QuickConnect/Enabled',
    // A bare JSON boolean, which is what the real endpoint answers with.
    handle: (_request, state) => ({ status: 200, body: state.quickConnect.enabled }),
  },

  {
    method: 'POST',
    path: '/QuickConnect/Initiate',
    handle: (request, state) => {
      // Switched off by the admin: the real Server raises an authentication
      // problem rather than handing back a code nobody could ever approve.
      if (!state.quickConnect.enabled) {
        return { status: 401, body: { error: 'Quick Connect is not enabled on this Server.' } };
      }

      const failWith = state.quickConnect.failInitiateWith ?? null;
      if (failWith !== null) {
        return {
          status: failWith,
          body: { error: 'The fake Jellyfin was told to fail starting Quick Connect.' },
        };
      }

      const authorization = request.headers.authorization ?? '';
      if (!/^MediaBrowser /i.test(authorization)) {
        return { status: 401, body: { error: 'No MediaBrowser authorization header.' } };
      }

      // The client identifies itself before it has a token, exactly as it does
      // for `AuthenticateByName`, and this is the device the token will be
      // issued against.
      const deviceId = valueFromAuthorization(authorization, 'DeviceId') ?? 'unknown';
      state.quickConnect.codesIssued += 1;
      // Six digits, as the real Server shows, and counted rather than random
      // so a test can read the code off the screen and approve exactly it.
      const code = String(100000 + state.quickConnect.codesIssued);
      const made: FakeQuickConnectRequest = {
        Secret: `secret-${code}`,
        Code: code,
        DeviceId: deviceId,
        DeviceName: valueFromAuthorization(authorization, 'Device') ?? 'unknown',
        AppName: valueFromAuthorization(authorization, 'Client') ?? 'unknown',
        AppVersion: valueFromAuthorization(authorization, 'Version') ?? 'unknown',
        DateAdded: new Date(0).toISOString(),
        Authenticated: false,
        authorizedUserId: null,
      };
      state.quickConnect.requests.push(made);
      return { status: 200, body: servableRequest(made) };
    },
  },

  {
    method: 'GET',
    path: '/QuickConnect/Connect',
    handle: (request, state) => {
      const secret = request.query.get('secret') ?? '';
      const found = state.quickConnect.requests.find((candidate) => candidate.Secret === secret);
      // Expired, withdrawn or already spent — all one answer, as on the real
      // Server. There is nothing left to poll either way.
      if (found === undefined) {
        return { status: 404, body: { error: 'No Quick Connect request for that secret.' } };
      }
      return { status: 200, body: servableRequest(found) };
    },
  },

  {
    method: 'POST',
    path: '/QuickConnect/Authorize',
    handle: (request, state) => {
      // The approving side is a signed-in app: it has to say who it is, and
      // whose account it is approving for.
      const approver = userForToken(request.headers.authorization ?? '', state);
      if (approver === undefined) return { status: 401, body: { error: 'No valid token.' } };

      const code = request.query.get('code') ?? '';
      const userId = request.query.get('userId') ?? approver.Id;
      const found = state.quickConnect.requests.find((candidate) => candidate.Code === code);
      if (found === undefined) {
        return { status: 404, body: { error: `No Quick Connect request with code ${code}.` } };
      }

      found.Authenticated = true;
      found.authorizedUserId = userId;
      // The real endpoint answers with whether it took effect.
      return { status: 200, body: true };
    },
  },

  {
    method: 'POST',
    path: '/Users/AuthenticateWithQuickConnect',
    handle: (request, state) => {
      const body = (request.body ?? {}) as { Secret?: unknown };
      // The field is `Secret`, and the Server requires it.
      const secret = typeof body.Secret === 'string' ? body.Secret : '';

      const index = state.quickConnect.requests.findIndex(
        (candidate) => candidate.Secret === secret,
      );
      const found = state.quickConnect.requests[index];
      if (found === undefined) {
        return { status: 404, body: { error: 'No Quick Connect request for that secret.' } };
      }
      // Still waiting: there is no token to give out yet, and saying so as a
      // 401 is what the real Server does.
      if (!found.Authenticated || found.authorizedUserId === null) {
        return { status: 401, body: { error: 'That Quick Connect request is not approved.' } };
      }

      const user = state.users.find((candidate) => candidate.Id === found.authorizedUserId);
      if (user === undefined) {
        return { status: 401, body: { error: 'The approving account no longer exists.' } };
      }

      // Spent: the request is gone, so the same secret cannot be exchanged
      // twice and polling it now answers 404.
      state.quickConnect.requests.splice(index, 1);

      return {
        status: 200,
        body: {
          User: publicViewOf(user),
          // Against the DeviceId that *initiated*. The Server allows one token
          // per DeviceId, and this is the device being signed in.
          AccessToken: `token-${user.Id}-${found.DeviceId}`,
          ServerId: user.ServerId,
          SessionInfo: {
            Id: `session-${user.Id}-${found.DeviceId}`,
            UserId: user.Id,
            DeviceId: found.DeviceId,
          },
        },
      };
    },
  },
];

/** A request as the Server serves it: the fake's own field left out. */
function servableRequest(made: FakeQuickConnectRequest) {
  const { authorizedUserId, ...served } = made;
  void authorizedUserId;
  return served;
}
