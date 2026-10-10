/** Entry point for Playwright's `webServer`. See playwright.config.ts. */
import { startFakeJellyfin } from './server.ts';
import { FAKE_JELLYFIN_PORT } from './url.ts';

startFakeJellyfin({ port: FAKE_JELLYFIN_PORT })
  .then((fake) => {
    process.stdout.write(`fake Jellyfin listening on ${fake.url}\n`);
    for (const signal of ['SIGINT', 'SIGTERM'] as const) {
      process.on(signal, () => {
        void fake.close().then(() => process.exit(0));
      });
    }
  })
  .catch((error: unknown) => {
    process.stderr.write(`fake Jellyfin failed to start: ${String(error)}\n`);
    process.exit(1);
  });
