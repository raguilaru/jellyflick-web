import type { AuthenticationResult } from '@jellyfin/sdk/lib/generated-client/models/authentication-result';
import {
  JellyfinHttpError,
  JellyfinUnreachableError,
  type JellyfinGateway,
} from '../jellyfin/gateway';
import type { SignedInUser } from './session';

/**
 * Quick Connect: signing in without typing a password, by showing a code and
 * waiting for somebody to approve it in another Jellyfin app (#9, story 12).
 *
 * The flow is the Server's (`docs/research/jellyfin-api.md` §2):
 *
 *     POST /QuickConnect/Initiate        → a Secret and a Code
 *     GET  /QuickConnect/Connect?secret= → until Authenticated is true
 *     POST /Users/AuthenticateWithQuickConnect { Secret } → a token
 *
 * Two things shape everything here.
 *
 * **One DeviceId for the whole attempt.** The Server remembers the DeviceId
 * that initiated and issues the token against it, and the Server allows one
 * token per DeviceId — so the attempt is handed a DeviceId, uses it for every
 * request, and the User it produces keeps it. This is the same bargain
 * `signIn` makes, and it is why Quick Connect fits the several-Users model
 * rather than sitting beside it (#8).
 *
 * **Polling must stop.** A loop left talking to a household's Server after the
 * User has walked away is the failure this module is written around, so every
 * way an attempt can end stops it, and all of them are in one place:
 *
 * | Ends because | Phase |
 * | --- | --- |
 * | the User is signed in | `signed-in` |
 * | the Server no longer has the request (404), or will not exchange it (401) | `refused` |
 * | nobody approved it before `lifetimeMs` | `expired` |
 * | the Server has Quick Connect switched off | `unavailable` |
 * | the Server could not be reached | `unreachable` |
 * | the Server answered with something else | `server-problem` |
 * | the screen went away, or the User chose a password instead | `stop()` |
 *
 * Nothing restarts an attempt by itself. Trying again is a new attempt, which
 * is a new code, because the old secret is spent or gone.
 */

/** Where a Quick Connect attempt has got to. */
export type QuickConnectState =
  /** Asking the Server for a code. Nothing to show yet. */
  | { phase: 'starting' }
  /** The code is on screen and the Server is being polled. */
  | { phase: 'waiting'; code: string }
  /** Approved: the secret is being exchanged for a token. */
  | { phase: 'signing-in' }
  | { phase: 'signed-in'; user: SignedInUser }
  /**
   * Nobody approved the code in time. The app knows it was time, because this
   * deadline is the app's own — see `DEFAULT_LIFETIME_MS`.
   */
  | { phase: 'expired' }
  /**
   * The Server will not act on the code any more. It answered 404, which it
   * gives for a request that ran out of time there, one that was withdrawn and
   * one already spent alike — or it refused the exchange. **The Server does
   * not say which**, so neither may the screen: it has to offer both readings
   * and a new code.
   */
  | { phase: 'refused' }
  /** The Server's admin has Quick Connect switched off. */
  | { phase: 'unavailable' }
  | { phase: 'unreachable' }
  | { phase: 'server-problem'; status: number };

/**
 * Five seconds, which `jellyfin-api.md` §2 settles on: the Server states no
 * interval, and this one is slow enough to be no load on a household's Server
 * while still feeling immediate to someone holding their phone.
 */
export const DEFAULT_POLL_INTERVAL_MS = 5_000;

/**
 * Five minutes, and **Jellyflick's own**: Jellyfin states no expiry for a
 * request at all. A code nobody has approved in five minutes is a screen
 * nobody is looking at, and a new one is a single press away.
 */
export const DEFAULT_LIFETIME_MS = 5 * 60 * 1000;

export type QuickConnectOptions = {
  /** Built with this attempt's DeviceId and no token. */
  gateway: JellyfinGateway;
  /**
   * Hands the Server's answer to the session, which turns it into a stored
   * User on this attempt's DeviceId and makes them the one watching. It lives
   * there rather than here because making a User out of an
   * `AuthenticationResult` is one job with one owner, whichever way the User
   * signed in. Undefined means the answer carried no usable token.
   */
  accept(result: AuthenticationResult): SignedInUser | undefined;
  /** Told every state, in order, until the attempt ends or is stopped. */
  onState(state: QuickConnectState): void;
  pollIntervalMs?: number;
  lifetimeMs?: number;
};

/** A running attempt. Stopping one is the only thing a caller can do to it. */
export type QuickConnectAttempt = {
  /**
   * Stops the polling and silences the attempt: no further state is reported,
   * whatever is already in flight. Safe to call more than once, and safe to
   * call after the attempt has ended on its own.
   */
  stop(): void;
};

export function runQuickConnect(options: QuickConnectOptions): QuickConnectAttempt {
  const pollIntervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const lifetimeMs = options.lifetimeMs ?? DEFAULT_LIFETIME_MS;

  let stopped = false;
  let pollTimer: ReturnType<typeof setTimeout> | undefined;
  let lifetimeTimer: ReturnType<typeof setTimeout> | undefined;

  /**
   * Ends the attempt: the timers go, nothing else is reported, and the last
   * state is told to the caller. Every ending in the table above comes through
   * here, which is what makes "the polling has stopped" one fact rather than
   * seven.
   */
  function finish(state: QuickConnectState): void {
    if (stopped) return;
    stop();
    options.onState(state);
  }

  function stop(): void {
    stopped = true;
    if (pollTimer !== undefined) clearTimeout(pollTimer);
    if (lifetimeTimer !== undefined) clearTimeout(lifetimeTimer);
    pollTimer = undefined;
    lifetimeTimer = undefined;
  }

  /** Maps anything thrown at us onto the state that says what happened. */
  function problem(error: unknown): QuickConnectState {
    if (error instanceof JellyfinUnreachableError) return { phase: 'unreachable' };
    if (error instanceof JellyfinHttpError) {
      // Gone, or never approved. The Server does not distinguish an expiry
      // from a withdrawal, so this one state carries both.
      if (error.status === 404 || error.status === 401 || error.status === 403) {
        return { phase: 'refused' };
      }
      return { phase: 'server-problem', status: error.status };
    }
    return { phase: 'server-problem', status: 0 };
  }

  options.onState({ phase: 'starting' });

  void options.gateway
    .initiateQuickConnect()
    .then((initiated) => {
      if (stopped) return;

      const secret = initiated.Secret;
      const code = initiated.Code;
      if (typeof secret !== 'string' || secret === '') {
        finish({ phase: 'server-problem', status: 200 });
        return;
      }
      if (typeof code !== 'string' || code === '') {
        finish({ phase: 'server-problem', status: 200 });
        return;
      }

      // The clock on the code starts when there is a code, not when the User
      // arrived on the screen.
      lifetimeTimer = setTimeout(() => {
        finish({ phase: 'expired' });
      }, lifetimeMs);

      options.onState({ phase: 'waiting', code });
      // Nobody can have approved a code they have not been shown yet, so the
      // first poll waits one interval like every other.
      pollTimer = setTimeout(() => {
        void poll(secret);
      }, pollIntervalMs);
    })
    .catch((error: unknown) => {
      // A Server with Quick Connect switched off refuses to start one at all,
      // which is a different thing to tell a User than a code going bad.
      if (error instanceof JellyfinHttpError && (error.status === 401 || error.status === 403)) {
        finish({ phase: 'unavailable' });
        return;
      }
      finish(problem(error));
    });

  /**
   * One poll, and the next one scheduled behind it. A chain rather than an
   * interval, so a slow answer delays the next question instead of stacking a
   * second one on top of it.
   */
  async function poll(secret: string): Promise<void> {
    if (stopped) return;

    let authenticated: boolean;
    try {
      const result = await options.gateway.getQuickConnectState(secret);
      authenticated = result.Authenticated === true;
    } catch (error) {
      finish(problem(error));
      return;
    }
    // The attempt may have been stopped while that request was in flight.
    if (stopped) return;

    if (!authenticated) {
      pollTimer = setTimeout(() => {
        void poll(secret);
      }, pollIntervalMs);
      return;
    }

    options.onState({ phase: 'signing-in' });

    let result: AuthenticationResult;
    try {
      result = await options.gateway.authenticateWithQuickConnect(secret);
    } catch (error) {
      finish(problem(error));
      return;
    }
    if (stopped) return;

    // Stored before the state is reported, so whoever is told "signed in" can
    // read the User off the session in the same breath.
    const user = options.accept(result);
    if (user === undefined) {
      finish({ phase: 'server-problem', status: 200 });
      return;
    }
    finish({ phase: 'signed-in', user });
  }

  return { stop };
}
