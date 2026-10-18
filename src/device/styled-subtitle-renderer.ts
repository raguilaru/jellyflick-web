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
 * Those two APIs are also why this module checks for them itself rather than
 * trusting `subtitleCapabilities().canRenderStyled`, which asks the broader
 * question — WebAssembly and a worker, which Chromium 68 does have. A browser
 * that can render *something* styled is not necessarily one JASSUB runs in, so
 * the engine-specific half of the test belongs with the engine.
 *
 * ## Licence obligation
 *
 * JASSUB bundles LGPL-2.1 libass, and shipping the WASM binary is
 * distribution: `player-subtitles.md` §6a notes the repo and image must carry
 * the licence texts. Tracked as a follow-up on the licences screen rather than
 * silently skipped — see the issue referenced in the ticket's report.
 */

/**
 * Whether JASSUB itself can run here, as its own README's requirements reduce
 * to on this project's floor. `requestVideoFrameCallback` is **not** in the
 * list even though the README names it: JASSUB 2.5 imports `rvfc-polyfill`,
 * so it brings its own. The canvas transfer is the one that cannot be
 * polyfilled, because it is how the worker gets something to draw on.
 */
function canRunJassub(): boolean {
  return (
    typeof OffscreenCanvas !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    'transferControlToOffscreen' in HTMLCanvasElement.prototype &&
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
   * The three `?url` imports are JASSUB's own documented bundler escape hatch
   * (`player-subtitles.md` §6a quotes it): the worker and the WASM have to be
   * separate assets with addresses of their own, because the worker fetches
   * the binary itself at runtime. Vite emits them as assets and hands back the
   * hashed URLs. Both WASM builds are named, and JASSUB picks between them by
   * testing for SIMD — the non-SIMD one is why this works on older engines.
   */
  const [{ default: JASSUB }, workerUrl, wasmUrl, modernWasmUrl] = await Promise.all([
    import('jassub'),
    import('jassub/dist/wasm/jassub-worker.js?url').then((module) => module.default),
    import('jassub/dist/wasm/jassub-worker.wasm?url').then((module) => module.default),
    import('jassub/dist/wasm/jassub-worker-modern.wasm?url').then((module) => module.default),
  ]);

  const renderer = new JASSUB({
    video: options.video,
    canvas: options.canvas,
    subContent: options.content,
    workerUrl,
    wasmUrl,
    modernWasmUrl,
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
