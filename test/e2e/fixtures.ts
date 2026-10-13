import { test as base, expect, type Page } from '@playwright/test';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

export type JellyflickOptions = {
  /**
   * When true, every pointer interaction is made impossible, so an accidental
   * `.click()` fails loudly instead of quietly hiding a focus-management bug.
   */
  keyboardOnly: boolean;
};

/**
 * Slows the browser's main thread down to stand in for CI's hardware, which is
 * roughly half the speed of a developer's machine.
 *
 * Every one of the timing bugs this suite has had passed locally and failed on
 * CI, so "it is green here" is never the evidence that matters: the evidence is
 * that it is green here *under a throttle*. `E2E_CPU_THROTTLE=4` is the knob,
 * off by default so an ordinary run is not slowed down, and it is a CDP call
 * because that is the only way Chromium will throttle on demand.
 */
const CPU_THROTTLE = Number(process.env.E2E_CPU_THROTTLE ?? 1);

export const test = base.extend<JellyflickOptions & { enforceKeyboardOnly: void; throttleCpu: void }>({
  keyboardOnly: [false, { option: true }],

  throttleCpu: [
    async ({ page }, use) => {
      if (CPU_THROTTLE > 1) {
        const session = await page.context().newCDPSession(page);
        await session.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLE });
      }
      await use();
    },
    { auto: true },
  ],

  enforceKeyboardOnly: [
    async ({ page, keyboardOnly }, use) => {
      if (keyboardOnly) {
        await page.addInitScript(() => {
          const style = document.createElement('style');
          style.textContent = '*, *::before, *::after { pointer-events: none !important; }';
          document.addEventListener('DOMContentLoaded', () => document.head.append(style));
        });
      }
      await use();
    },
    { auto: true },
  ],
});

export { expect };

/**
 * Opens the app with the runtime config the container would have written.
 * `/config.js` is fulfilled rather than the global being set, because that is
 * the same indirection production uses.
 */
export async function openApp(
  page: Page,
  config: { serverAddress?: string; appVersion?: string } = {},
): Promise<void> {
  const body = `window.__JELLYFLICK_CONFIG__ = ${JSON.stringify({
    serverAddress: config.serverAddress ?? '',
    appVersion: config.appVersion ?? 'e2e',
  })};`;
  await page.route('**/config.js', (route) =>
    route.fulfill({ status: 200, contentType: 'application/javascript', body }),
  );
  await page.goto('/');
}

export const FAKE_JELLYFIN_URL = fakeJellyfinUrl();
