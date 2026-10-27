import { defineConfig, devices } from '@playwright/test';
import type { JellyflickOptions } from './test/e2e/fixtures';
import { FAKE_JELLYFIN_PORT } from './test/fake-jellyfin/url';

// Overridable so two worktrees can run the suite at once. `reuseExistingServer`
// would otherwise hand one worktree the other's preview build and quietly make
// the run meaningless. `FAKE_JELLYFIN_PORT` is overridable the same way.
const APP_PORT = Number(process.env.APP_PORT ?? 4173);

export default defineConfig<JellyflickOptions>({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  use: { baseURL: `http://127.0.0.1:${String(APP_PORT)}`, trace: 'on-first-retry' },

  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } },
    },
    {
      // Phone size, not touch emulation: these checks are about layout and
      // reachability, so `isMobile` would only add noise.
      name: 'phone',
      use: { ...devices['Desktop Chrome'], viewport: { width: 390, height: 844 } },
    },
    {
      name: 'keyboard-only',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        keyboardOnly: true,
      },
    },
  ],

  // The fake Jellyfin is started the same way Vitest starts it, and the app is
  // served from a production build, so the E2E suite exercises the real
  // Chromium 68 output rather than the dev server's.
  webServer: [
    {
      command: 'node --experimental-strip-types test/fake-jellyfin/bin.ts',
      url: `http://127.0.0.1:${String(FAKE_JELLYFIN_PORT)}/__fake/health`,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
    },
    {
      command: `npm run build && npx vite preview --host 127.0.0.1 --port ${String(APP_PORT)} --strictPort`,
      url: `http://127.0.0.1:${String(APP_PORT)}`,
      reuseExistingServer: !process.env.CI,
    },
  ],
});
