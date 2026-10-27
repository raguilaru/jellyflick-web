/**
 * Helpers for the fake Jellyfin's control endpoints, for use from Vitest.
 * Playwright talks to the same endpoints through its own `request` fixture.
 */
import type { RecordedRequest } from './server.ts';
import { fakeJellyfinUrl } from './url.ts';

/** Shallow-merges a patch over the sample data, one level deep. */
export async function setFakeState(patch: unknown): Promise<void> {
  await control('POST', '/__fake/state', patch);
}

/** The sample data as it stands: what a test asserts the Server now holds. */
export async function fakeState(): Promise<Record<string, unknown>> {
  return (await control('GET', '/__fake/state')) as Record<string, unknown>;
}

/** Puts the sample data back to how it was seeded. */
export async function resetFakeState(): Promise<void> {
  await control('DELETE', '/__fake/state');
}

/** Every non-GET request the fake has received: what tests assert was saved. */
export async function fakeWrites(): Promise<RecordedRequest[]> {
  return (await control('GET', '/__fake/writes')) as RecordedRequest[];
}

export async function forgetFakeWrites(): Promise<void> {
  await control('DELETE', '/__fake/writes');
}

export async function fakeRequests(): Promise<RecordedRequest[]> {
  return (await control('GET', '/__fake/requests')) as RecordedRequest[];
}

export async function forgetFakeRequests(): Promise<void> {
  await control('DELETE', '/__fake/requests');
}

/**
 * Waits until the fake Jellyfin has stopped being written to (#46).
 *
 * **Every test that changes a Client Setting owes its `afterEach` this call
 * before `resetFakeState`.** A save is written *behind* the User — the screen
 * shows the change at once and the round trip happens after it, which is what
 * makes pressing "move up" four times on a remote bearable — so a save one
 * test started can land **after** the next test has reseeded the Server and
 * hand that test a setting nobody in it ever made.
 *
 * It is a leak with the worst possible signature: the victim fails **only in
 * sequence, never in isolation**, and need not look like a settings bug at
 * all. #28 met it as a subtitle that silently refused to draw. Vitest runs one
 * file at a time against one shared fake, so the victim is often a *different
 * file* and the trail is cold by the time anyone looks.
 *
 * Two readings of the write log with nothing in between is what "settled"
 * means here. That is a quiet gap, not a proof: a save the app has issued but
 * whose request has not yet reached the fake is invisible to it. It holds
 * because the fake is on this machine, a save is a read-modify-write of a few
 * milliseconds, and saves are chained one after another — so `quietMs` of
 * silence is many round trips wide. Do not shorten the gap, and do not reach
 * for this if a test ever needs a deliberately *slow* Server: it would not
 * protect that one.
 *
 * **Where to put it.** `afterEach`, immediately before `resetFakeState()`,
 * catches a write a *press* started: it is already queued by the time the hook
 * runs. It cannot catch a write **unmounting** starts, because `cleanup` is
 * registered in `test/setup.ts` and so runs after a file's own `afterEach` —
 * for that one, settle in the next `beforeEach` instead, before it forgets the
 * write log or reseeds. A playback stop report is the write that behaves that
 * way.
 *
 * It throws rather than giving up quietly. A write log that never stops
 * growing means something is still running after the test ended, which is
 * worth a failure rather than a reseed that races it anyway.
 */
export async function savesHaveSettled({
  timeoutMs = 2_000,
  quietMs = 20,
}: { timeoutMs?: number; quietMs?: number } = {}): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let seen = (await fakeWrites()).length;
  for (;;) {
    await new Promise((resolve) => setTimeout(resolve, quietMs));
    const writes = await fakeWrites();
    if (writes.length === seen) return;
    seen = writes.length;
    if (Date.now() > deadline) {
      const last = writes[writes.length - 1];
      throw new Error(
        `The fake Jellyfin was still being written to ${String(timeoutMs)}ms after a test ended` +
          ` (${String(writes.length)} writes, last ${last?.method ?? '?'} ${last?.path ?? '?'}).`,
      );
    }
  }
}

async function control(method: string, path: string, body?: unknown): Promise<unknown> {
  const response = await fetch(`${fakeJellyfinUrl()}${path}`, {
    method,
    ...(body === undefined
      ? {}
      : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  if (!response.ok) {
    throw new Error(`${method} ${path} on the fake Jellyfin returned ${String(response.status)}`);
  }
  return response.status === 204 ? undefined : await response.json();
}
