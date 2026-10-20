import type { StyledSubtitleRenderer, StyledSubtitleRendererOptions } from './types';

/**
 * The styled-subtitle renderer for browsers: **JASSUB**, which is libass,
 * FreeType, HarfBuzz and FriBidi compiled to WebAssembly (#29, story 104).
 *
 * This module is reached only through `import()`, from
 * `browser.ts`'s `loadStyledSubtitleRenderer`, and that is the whole reason it
 * is a module of its own: everything it pulls in — the engine, its worker and
 * a couple of megabytes of WASM — is in a chunk nobody downloads until a User
 * chooses a styled track. Importing it anywhere eagerly would put it in the
 * bundle a TV fetches to draw Home, so **nothing may import this statically.**
 *
 * ## Why JASSUB here and not on the TV
 *
 * `decisions.md` §8 and `player-subtitles.md` §6a: JASSUB needs
 * `OffscreenCanvas` and `transferControlToOffscreen`, both Chrome 69, so it
 * **cannot run on the Chromium 68 floor** webOS 5 sits on. It is the right
 * answer for the web — maintained, published this month, and faster — and the
 * TV's answer is `libass-wasm`, whose npm release is four years old. The two
 * are not interchangeable and the seam is what lets each be used where it
 * works: the webOS device layer will answer `loadStyledSubtitleRenderer` with
 * its own module, and nothing in `src/playback/` will know.
 *
 * Those APIs are also why this module checks for them itself rather than
 * trusting `subtitleCapabilities().canRenderStyled`, which asks the broader
 * question — WebAssembly and a worker, which Chromium 68 does have. A browser
 * that can render *something* styled is not necessarily one JASSUB runs in, so
 * the engine-specific half of the test belongs with the engine.
 *
 * ## Licence obligation
 *
 * JASSUB bundles LGPL-2.1 libass, and shipping the WASM binary is
 * distribution, so the licence texts travel with the app: #48 put them in
 * `public/licences/`, which the settings screen links to.
 *
 * One of them is gone again. `jassub` also imports `rvfc-polyfill`, which is
 * **GPL-3.0** — strong copyleft on the combined work, unlike everything else
 * in the bundle — so #57 aliased it to an empty module in `vite.config.ts`
 * rather than take terms for the whole app from a polyfill. That is why
 * `canRunJassub` below asks about `requestVideoFrameCallback`.
 */

/**
 * Whether JASSUB itself can run here, as its own README's requirements reduce
 * to on this project's floor. The canvas transfer is the one that cannot be
 * polyfilled, because it is how the worker gets something to draw on.
 *
 * **`requestVideoFrameCallback` is in this list as of #57, and it has to be.**
 * It used to be left out on the grounds that JASSUB brings its own polyfill —
 * `jassub` does `import 'rvfc-polyfill'` — but that polyfill is GPL-3.0 and
 * #57 took it out of the bundle, so the question goes back to the browser.
 *
 * The versions this decides are real, not theoretical. `rvfc-polyfill` was
 * load-bearing on **Firefox 105-131** and **Chrome 80-82**: they have the
 * canvas transfer and no native `requestVideoFrameCallback` (MDN BCD — rVFC is
 * Chrome 83 and Firefox 132; `transferControlToOffscreen` is Chrome 69 and
 * Firefox 105). On those, styled subtitles now fall back to the flattened
 * words instead of the styling, which is the trade #57 made knowingly.
 *
 * Checking it here rather than letting JASSUB find out matters, because
 * JASSUB calls it *after* `ready` has resolved — on the first frame. Without
 * this line those browsers get a resolved renderer and then a throw from
 * inside the engine, which is past the only point where the caller can still
 * draw the words instead.
 */
function canRunJassub(): boolean {
  return (
    typeof OffscreenCanvas !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'transferControlToOffscreen' in HTMLCanvasElement.prototype &&
    typeof HTMLVideoElement !== 'undefined' &&
    'requestVideoFrameCallback' in HTMLVideoElement.prototype &&
    typeof WebAssembly !== 'undefined' &&
    typeof Worker !== 'undefined'
  );
}

export async function createStyledSubtitleRenderer(
  options: StyledSubtitleRendererOptions,
): Promise<StyledSubtitleRenderer> {
  if (!canRunJassub()) {
    // Rejecting is the contract: the caller draws the words instead. Saying
    // which engine was wanted keeps a browser console honest about why the
    // styling is missing, which is the one diagnosis a User might report.
    throw new Error('This browser cannot run the styled-subtitle renderer.');
  }

  /*
   * Imported here rather than at the top of the module, so a browser that
   * cannot run it does not fetch it: this module is already in a chunk of its
   * own, and the engine is the two megabytes inside that chunk.
   */
  const { default: JASSUB } = await import('jassub');

  /*
   * **No `workerUrl` or `wasmUrl`.** JASSUB's own defaults are
   * `new Worker(new URL('./worker/worker.js', import.meta.url), { type: 'module' })`
   * and `new URL('./wasm/jassub-worker.wasm', import.meta.url)`, and those are
   * precisely the two patterns a modern bundler understands: Vite bundles the
   * worker — which it must, because `worker/worker.js` imports bare specifiers
   * a browser cannot resolve — and emits both WASM builds and the default font
   * as assets with hashed addresses of their own. JASSUB picks between the two
   * binaries by testing for SIMD.
   *
   * Pointing `workerUrl` at `jassub/dist/wasm/jassub-worker.js` is the trap
   * here, and it fails **silently**: that file is the Emscripten glue loaded
   * *inside* the worker, not the worker, so the Worker starts, nothing ever
   * answers, `ready` never settles and a User watches a blank canvas with no
   * error anywhere. `test/e2e/styled-subtitles.spec.ts` is what catches it.
   */
  const renderer = new JASSUB({
    video: options.video,
    canvas: options.canvas,
    subContent: options.content,
    // The embedded fonts (`MediaAttachments`), as URLs the worker fetches
    // itself. `fonts` is the list of extra faces to load beside the default.
    fonts: [...options.fontUrls],
    timeOffset: options.timeOffset,
    /*
     * Local fonts are deliberately **not** queried. `queryFonts: 'local'` uses
     * the Local Font Access API, which is a permission prompt in the browsers
     * that have it and absent everywhere else — a dialogue asking to enumerate
     * a User's fonts, in the middle of a film, is not a trade this app makes
     * for a closer match to a typesetter's intent. The file's own embedded
     * fonts are the ones that matter, and they are above.
     */
    queryFonts: false,
  });

  /*
   * **Waited for, and this is the difference between a fallback and a blank
   * canvas.** The constructor returns at once; everything that can really go
   * wrong — the worker, the WASM binary, libass refusing the file — happens
   * after it, inside `ready`. Resolving the seam's promise before that would
   * report success for a renderer that never draws, and the caller would have
   * no reason to fall back to the words. Rejecting here is what makes
   * `onUnsupported` honest.
   */
  await renderer.ready;

  return {
    setTimeOffset: (seconds) => {
      // A plain property on the instance, which JASSUB forwards to libass.
      renderer.timeOffset = seconds;
    },
    destroy: () => {
      // Returns a promise, which nothing waits for: there is nothing useful to
      // do with the knowledge that a worker has finished shutting down, and
      // the seam is synchronous so an unmount is not held up by it.
      void renderer.destroy();
    },
  };
}
