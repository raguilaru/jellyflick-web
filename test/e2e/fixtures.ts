import { test as base, expect, type Page } from '@playwright/test';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

export type JellyflickOptions = {
  /**
   * When true, every pointer interaction is made impossible, so an accidental
   * `.click()` fails loudly instead of quietly hiding a focus-management bug.
   */
  keyboardOnly: boolean;
};

export const test = base.extend<JellyflickOptions & { enforceKeyboardOnly: void }>({
  keyboardOnly: [false, { option: true }],

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
