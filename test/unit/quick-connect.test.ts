import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAuthorizationHeader } from '../../src/jellyfin/authorization';
import { createSession, type Session } from '../../src/session/session';
import type { QuickConnectState } from '../../src/session/quick-connect';
import { inMemoryDeviceStorage, testDeviceLayer } from '../device/profiles';
import { fakeRequests, resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

/**
 * Quick Connect as the app drives it: a code to show, then polling until
 * somebody approves it in another Jellyfin app, then a token.
 *
 * Every test here runs against the real fake Jellyfin over HTTP, and polls
 * fast — the app's own interval is five seconds, which is a property of the
 * Server's patience rather than of this logic.
 *
 * **Telling one test's traffic apart from another's.** The fake remembers every
 * request it has ever seen and a polling flow makes a lot of them, so no
 * assertion here counts requests in general: each one counts only the polls
 * carrying *its own* secret, which the Server issues fresh per request.
 */
const FAST_POLL = { pollIntervalMs: 5 };

let session: Session;

beforeEach(async () => {
  await resetFakeState();
  session = createSession({
    device: testDeviceLayer({ storage: inMemoryDeviceStorage() }),
    client: 'Jellyflick',
    appVersion: 'test',
  });
  session.useServer(fakeJellyfinUrl());
});

afterEach(resetFakeState);

describe('signing in with Quick Connect', () => {
  it('shows a code and signs the User in once it has been approved', async () => {
    const seen = watch();
    const attempt = session.startQuickConnect({ onState: seen.record, ...FAST_POLL });

    const code = await seen.code();
    expect(code).toMatch(/^\d{6}$/);

    await approveCode(code, 'user-rafael');

    const state = await seen.settled();
    expect(state).toMatchObject({ phase: 'signed-in' });
    // The User is in the session, so the app has nothing more to do than show
    // them Home: this is the same shape a password sign-in leaves behind.
    expect(session.activeUser()?.name).toBe('Rafael');
    attempt.stop();
  });

  /**
   * The token the Server issues belongs to the DeviceId that *initiated*, and
   * the session has to keep that DeviceId for the User rather than mint a
   * second one — a second would be a second token, and the Server allows one
   * per DeviceId.
   */
  it('keeps the DeviceId it initiated with, so the token it is given works', async () => {
    const seen = watch();
    const attempt = session.startQuickConnect({ onState: seen.record, ...FAST_POLL });
    await approveCode(await seen.code(), 'user-rafael');
    await seen.settled();
    attempt.stop();

    const user = session.activeUser();
    expect(user?.token).toBe(`token-user-rafael-${String(user?.deviceId)}`);

    // And the token really works: the Server answers for it.
    await expect(session.gateway().getCurrentUser()).resolves.toMatchObject({ Name: 'Rafael' });
  });

  it('stops polling the Server the moment it has signed in', async () => {
    const seen = watch();
    const attempt = session.startQuickConnect({ onState: seen.record, ...FAST_POLL });
    const code = await seen.code();
    await approveCode(code, 'user-rafael');
    await seen.settled();
    attempt.stop();

    const polls = await pollsFor(code);
    await waitABit();
    expect(await pollsFor(code)).toBe(polls);
  });

  /**
   * The screen going away has to stop the polling, or a User who walked off
   * the sign-in screen leaves a loop talking to their Server for as long as
   * the page is open.
   */
  it('stops polling when the attempt is given up on', async () => {
    const seen = watch();
    const attempt = session.startQuickConnect({ onState: seen.record, ...FAST_POLL });
    const code = await seen.code();
    // It is really polling before it is stopped, or this would pass by
    // measuring nothing.
    await waitUntil(async () => (await pollsFor(code)) >= 2);

    attempt.stop();

    const polls = await pollsFor(code);
    await waitABit();
    expect(await pollsFor(code)).toBe(polls);
  });

  /**
   * The Server answers 404 once a request is gone, and says no more than that:
   * it may have run out of time there, it may have been turned down in the
   * other app, and no client can tell. So one state carries both, and the
   * screen says both.
   */
  it('gives up when the Server no longer has the request, and stops polling', async () => {
    const seen = watch();
    const attempt = session.startQuickConnect({ onState: seen.record, ...FAST_POLL });
    const code = await seen.code();

    // The request is gone from the Server — expired there, or withdrawn.
    await setFakeState({ quickConnect: { enabled: true, requests: [], codesIssued: 9 } });

    expect(await seen.settled()).toMatchObject({ phase: 'refused' });

    const polls = await pollsFor(code);
    await waitABit();
    expect(await pollsFor(code)).toBe(polls);
    attempt.stop();
  });

  /**
   * Jellyfin states no expiry for a Quick Connect request, so this deadline is
   * Jellyflick's own: a code nobody has approved after a while is a screen
   * nobody is looking at, and polling on behalf of a User who has gone is the
   * thing being avoided. It is a different message from the Server's 404,
   * because here the app *knows* it was time rather than guessing.
   */
  it('gives up on a code nobody approves in time, and stops polling', async () => {
    const seen = watch();
    const attempt = session.startQuickConnect({
      onState: seen.record,
      pollIntervalMs: 5,
      lifetimeMs: 30,
    });
    const code = await seen.code();

    expect(await seen.settled()).toMatchObject({ phase: 'expired' });

    const polls = await pollsFor(code);
    await waitABit();
    expect(await pollsFor(code)).toBe(polls);
    attempt.stop();
  });

  it('says Quick Connect is not available when the Server has it switched off', async () => {
    await setFakeState({ quickConnect: { enabled: false, requests: [], codesIssued: 0 } });

    const seen = watch();
    const attempt = session.startQuickConnect({ onState: seen.record, ...FAST_POLL });

    expect(await seen.settled()).toMatchObject({ phase: 'unavailable' });
    attempt.stop();
  });

  it('says the Server could not be reached rather than blaming the code', async () => {
    session.useServer('http://127.0.0.1:1');

    const seen = watch();
    const attempt = session.startQuickConnect({ onState: seen.record, ...FAST_POLL });

    expect(await seen.settled()).toMatchObject({ phase: 'unreachable' });
    attempt.stop();
  });
});

/** Every state the flow has reported, and ways of waiting for the ones that matter. */
function watch() {
  const states: QuickConnectState[] = [];
  const record = (state: QuickConnectState): void => {
    states.push(state);
  };

  return {
    record,
    states,

    /** The code, once the flow has one to show. */
    async code(): Promise<string> {
      await waitUntil(() => states.some((state) => state.phase === 'waiting'));
      const waiting = states.find((state) => state.phase === 'waiting');
      return waiting?.phase === 'waiting' ? waiting.code : '';
    },

    /** The first state the flow will not move on from by itself. */
    async settled(): Promise<QuickConnectState> {
      await waitUntil(() => states.some(isSettled));
      return states.find(isSettled) as QuickConnectState;
    },
  };
}

const SETTLED_PHASES = [
  'signed-in',
  'expired',
  'refused',
  'unavailable',
  'unreachable',
  'server-problem',
];

function isSettled(state: QuickConnectState): boolean {
  return SETTLED_PHASES.includes(state.phase);
}

/** How many times the flow has polled for one secret: this test's own traffic. */
async function pollsFor(code: string): Promise<number> {
  const requests = await fakeRequests();
  return requests.filter(
    (request) =>
      request.path.startsWith('/QuickConnect/Connect') && request.path.includes(`secret-${code}`),
  ).length;
}

/**
 * Approves a code the way the other Jellyfin app does: signed in there, through
 * the Server's own approving endpoint. Jellyflick never calls it, so this goes
 * through `fetch` rather than through the gateway.
 */
async function approveCode(code: string, userId: string): Promise<void> {
  const deviceId = `approves-${code}`;
  const response = await fetch(
    `${fakeJellyfinUrl()}/QuickConnect/Authorize?code=${encodeURIComponent(code)}&userId=${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: buildAuthorizationHeader({
          client: 'Other Jellyfin App',
          device: 'Another Device',
          deviceId,
          appVersion: 'test',
          token: `token-${userId}-${deviceId}`,
        }),
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Approving ${code} answered ${String(response.status)}`);
  }
}

/** Long enough for several of this suite's 5 ms polls to have happened. */
async function waitABit(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 60));
}

async function waitUntil(
  satisfied: () => boolean | Promise<boolean>,
  timeoutMs = 2000,
): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    if (await satisfied()) return;
    if (Date.now() > deadline) throw new Error('Timed out waiting for the flow');
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
