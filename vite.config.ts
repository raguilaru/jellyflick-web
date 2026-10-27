import { fileURLToPath } from 'node:url';
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
  resolve: {
    alias: {
      /*
       * #57: `rvfc-polyfill` is **GPL-3.0**, and this alias is the only reason
       * its code is not in the bundle. **An unexplained alias to an empty
       * module looks like leftover scaffolding, so: do not remove this.**
       *
       * Nobody here chose the dependency. `jassub` does
       * `import 'rvfc-polyfill'` unconditionally, so the polyfill was linked
       * into `dist/assets/jassub-*.js` for every visitor. Every other licence
       * in the bundle is permissive or weak copyleft; GPL-3.0 is strong
       * copyleft on the *combined work*, so shipping it constrains the terms
       * Jellyflick itself can be offered under — a choice still on the spec's
       * "later" list, which should not be settled by a polyfill nobody needs.
       * The notice obligation went with the code: #48's `GPL-3.0.txt` and its
       * `NOTICE.txt` entry came out in the same change.
       *
       * **Safe because the browsers that can run JASSUB at all have the API
       * natively**, and because the one place that is not true is now gated.
       * `requestVideoFrameCallback` is Chrome 83 / Firefox 132 / Safari 15.4,
       * and `decisions.md` §8 rules JASSUB out on the Chromium 68 floor
       * entirely. The exceptions are **Firefox 105-131** and **Chrome 80-82**,
       * which have `transferControlToOffscreen` (Chrome 69 / Firefox 105) and
       * no rVFC — the polyfill really was load-bearing there, so
       * `canRunJassub` in `src/device/styled-subtitle-renderer.ts` now tests
       * for rVFC and those versions fall back to the flattened words. That
       * trade is #57's, recorded in `architecture.md`.
       *
       * `test/e2e/the-container-serves-the-app.spec.ts` greps the built chunks
       * for the polyfill's own symbols, so if this alias stops working the
       * suite says so rather than the licence quietly coming back.
       */
      'rvfc-polyfill': fileURLToPath(
        new URL('./build/rvfc-polyfill-not-shipped.js', import.meta.url),
      ),
    },
  },
  build: {
    target: 'chrome68',
    cssTarget: 'chrome68',
    // hls.js is the one chunk over Vite's default 500 kB warning, and it is
    // over it on purpose: it is `import()`ed only when a transcode has to be
    // played (#25), so it is never in the bundle a TV downloads to show Home.
    // The limit is raised just past it rather than switched off, so anything
    // else growing that large still says so.
    chunkSizeWarningLimit: 600,
  },
});
