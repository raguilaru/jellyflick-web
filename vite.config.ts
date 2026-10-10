import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// ADR 0002: JavaScript is transpiled for Chromium 68 so LG webOS 5 can be
// supported later. `chrome68` is enough on its own — @vitejs/plugin-legacy is
// deliberately absent, because Chromium 68 already clears Vite's own floor
// (native ESM, dynamic import(), import.meta).
//
// Never build for production with `minify: false`: CSS downleveling is done by
// the CSS minifier, so with minification off modern CSS ships raw to the target.
export default defineConfig({
  plugins: [preact()],
  build: {
    target: 'chrome68',
    cssTarget: 'chrome68',
  },
});
