/**
 * Where the fake Jellyfin listens. A fixed port rather than an ephemeral one,
 * because Vitest's workers, the Playwright test process and the browser under
 * test all need the same answer without any plumbing between them.
 */
export const FAKE_JELLYFIN_PORT = Number(process.env.FAKE_JELLYFIN_PORT ?? 8787);

export function fakeJellyfinUrl(): string {
  return `http://127.0.0.1:${FAKE_JELLYFIN_PORT}`;
}
