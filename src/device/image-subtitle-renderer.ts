import { PgsRenderer } from 'libpgs';
/*
 * The worker, as an **emitted asset's URL**, which is the whole subject of the
 * long note below. `?url` is Vite's "give me the address, not the module": the
 * file is copied into the build with a hashed name and this import is the
 * string that addresses it. It sits in this module, so it is in this module's
 * lazy chunk and no page that never draws a PGS track fetches it.
 */
import pgsWorkerUrl from 'libpgs/dist/libpgs.worker.js?url';
import type { ImageSubtitleRenderer, ImageSubtitleRendererOptions } from './types';

/**
 * The image-subtitle renderer for browsers: **libpgs**, which decodes a PGS
 * (Presentation Graphic Stream) `.sup` and draws its bitmaps on a canvas
 * (#30).
 *
 * Reached only through `import()`, from `browser.ts`'s
 * `loadImageSubtitleRenderer`, and that is why it is a module of its own:
 * the decoder and its worker are in a chunk nobody downloads until a User
 * chooses a PGS track, which is the ticket's second acceptance criterion.
 * **Nothing may import this statically.**
 *
 * ## Why libpgs runs where JASSUB cannot
 *
 * The opposite of #29's story, and worth stating because the two sit side by
 * side. JASSUB is WebAssembly and needs `transferControlToOffscreen`
 * (Chrome 69), so it cannot run on the Chromium 68 floor webOS 5 sits on and
 * the TV needs a different engine. libpgs is **plain JavaScript** — no WASM,
 * no binary to validate — and `BrowserSupport.getRendererModeByPlatform()`
 * answers `workerWithoutOffscreenCanvas` on a browser without the canvas
 * transfer: the stream is fetched and decoded in a worker and the bitmaps are
 * drawn on the main thread. So the floor is covered by the library itself and
 * this module is expected to be the TV's answer too.
 *
 * That is also why the mode is **not** forced here. Letting libpgs pick means
 * a browser that has `OffscreenCanvas` decodes and draws entirely off the main
 * thread, and one that does not still works.
 *
 * ## VobSub and DVB are not here, and that is the ticket's first finding
 *
 * Recorded on #30 and summarised in `subtitle-presentation.ts`: there is no
 * maintained client-side VobSub renderer that runs on this app's floor, and
 * Jellyfin's graphical passthrough hands over a raw PGS payload and **never**
 * a VobSub `.idx`, so even a perfect one would have the bitmaps and no
 * palette. Those two are the Server's to burn into the picture.
 *
 * ## Licence obligation
 *
 * libpgs is MIT, which is a notice obligation rather than LGPL's source one —
 * shipping the decoder means shipping its copyright line. Filed against the
 * existing licences issue beside libass's rather than as a new one, since the
 * two want the same screen that does not exist yet.
 */

/**
 * Whether libpgs can run here at all.
 *
 * A much lower bar than JASSUB's, and deliberately so: the library itself
 * degrades from a worker with an offscreen canvas, to a worker without one, to
 * the main thread, so the only things it truly cannot do without are a canvas
 * 2D context and `fetch`. Both are far below the Chromium 68 floor, so this
 * is a guard against an exotic environment rather than against a real device —
 * happy-dom, for one, which is why nothing in the unit suite reaches here.
 */
function canRunLibpgs(): boolean {
  return typeof HTMLCanvasElement !== 'undefined' && typeof fetch !== 'undefined';
}

export async function createImageSubtitleRenderer(
  options: ImageSubtitleRendererOptions,
): Promise<ImageSubtitleRenderer> {
  if (!canRunLibpgs()) {
    // Rejecting is the contract. Unlike the styled renderer there is no second
    // thing for the caller to draw — the bitmap *is* the subtitle — so what
    // this buys is a notice beside the picture instead of a blank canvas.
    throw new Error('This browser cannot run the image-subtitle renderer.');
  }

  const renderer = new PgsRenderer({
    video: options.video,
    canvas: options.canvas,

    /*
     * **`workerUrl` is passed, and leaving it out is this ticket's version of
     * #29's silent failure.**
     *
     * libpgs defaults it to the bare relative string `'libpgs.worker.js'`
     * (`pgsRendererInWorker.ts`), which `new Worker()` resolves against the
     * *document's* address — so on this app it asks for `/libpgs.worker.js`,
     * which the SPA answers with `index.html`. The Worker then starts, parses
     * HTML as JavaScript, and nothing ever replies: `ready` never settles, no
     * error reaches anywhere, and a User watches a blank canvas. It is the
     * same shape as the `workerUrl` trap #29 hit with JASSUB and the same
     * reason it could not be caught by a unit test — the default is only
     * wrong once something really tries to start a worker.
     *
     * Nor would a bundler have fixed it: `new Worker(someString)` is a runtime
     * value, not the `new Worker(new URL(…, import.meta.url))` form Vite
     * rewrites, so the file would never have been emitted at all. Hence the
     * `?url` import above, which both emits it and gives its hashed address.
     *
     * `test/e2e/image-subtitles.spec.ts` is what holds this: it reads the
     * fake's own request log, because **a worker's requests are not the
     * page's** and nothing watching the page would see the stream being
     * fetched at all.
     */
    workerUrl: pgsWorkerUrl,

    /*
     * The stream's address rather than its bytes, so the worker fetches it
     * where it decodes it. The token is already in the query (`ApiKey`), which
     * is the same arrangement #29's embedded fonts use and for the same
     * reason: this app does not make the request, so it cannot send a header.
     */
    subUrl: options.subtitleUrl,

    timeOffset: options.timeOffset,

    /*
     * Matched to `.player__video`'s own `object-fit: contain`, which libpgs's
     * own documentation asks for. A PGS display set carries absolute
     * coordinates inside the video's full frame, so a canvas that letterboxed
     * differently from the picture would draw every line off its mark —
     * subtly at 16:9 and badly at 2.39:1, which is most films.
     */
    aspectRatio: 'contain',
  });

  /*
   * **Waited for**, which is #29's hardest-won lesson applied before it could
   * be repeated. The constructor returns at once and kicks the load off in the
   * background; everything that can really go wrong — the worker, the fetch,
   * a stream libpgs will not parse — happens afterwards inside `ready`.
   * Resolving before it would report success for a renderer that never draws,
   * and the caller would have no reason to say anything to the User.
   */
  await renderer.ready;

  return {
    setTimeOffset: (seconds) => {
      // A setter on the instance, which libpgs forwards to the decoder and
      // then re-renders the current moment with.
      renderer.timeOffset = seconds;
    },
    destroy: () => {
      // libpgs calls it `dispose`; it stops the worker and unhooks the video
      // listeners. The canvas is ours, so it leaves it alone — `canvasOwner`
      // is false whenever one is passed in, which is always here.
      renderer.dispose();
    },
  };
}
