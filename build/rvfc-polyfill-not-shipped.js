/**
 * Deliberately empty. This file stands in for `rvfc-polyfill` at build time —
 * `vite.config.ts` aliases that package here — and the reason is a licence, so
 * **please do not delete it as dead code.** The alias in `vite.config.ts`
 * carries the full reasoning; the short version:
 *
 * `rvfc-polyfill` is **GPL-3.0**, strong copyleft on the combined work, where
 * every other licence in this bundle is permissive or weak copyleft. It is not
 * a dependency anyone here chose: `jassub` does `import 'rvfc-polyfill'`
 * unconditionally, so its code landed in `dist/assets/jassub-*.js` whether a
 * browser needed a `requestVideoFrameCallback` polyfill or not, and that
 * constrained the terms Jellyflick itself could be offered under (#57).
 *
 * Nothing needs to be exported, because the real package has no exports
 * either: it is a side-effect import that patches `HTMLVideoElement`.
 * `src/device/styled-subtitle-renderer.ts` is what makes the absence safe — it
 * refuses to start the engine in a browser with no native
 * `requestVideoFrameCallback`, so the fallback is the flattened words rather
 * than a throw on the first frame.
 */
