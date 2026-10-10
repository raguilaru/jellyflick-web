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
