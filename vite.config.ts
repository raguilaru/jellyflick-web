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
    // hls.js is the one chunk over Vite's default 500 kB warning, and it is
    // over it on purpose: it is `import()`ed only when a transcode has to be
    // played (#25), so it is never in the bundle a TV downloads to show Home.
    // The limit is raised just past it rather than switched off, so anything
    // else growing that large still says so.
    chunkSizeWarningLimit: 600,
  },
});
