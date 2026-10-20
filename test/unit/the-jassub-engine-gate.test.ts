import { afterEach, describe, expect, it } from 'vitest';
import { createStyledSubtitleRenderer } from '../../src/device/styled-subtitle-renderer';

/**
 * Which browsers the JASSUB engine will admit to running in (#57).
 *
 * The seam is the device layer's own public interface —
 * `createStyledSubtitleRenderer`, whose documented contract is that it
 * *rejects* where the engine cannot run, because rejecting is what makes the
 * caller fall back to drawing the words. That contract is the whole of what
 * this file tests; whether the engine then draws anything is a question only a
 * real browser can answer, and `test/e2e/styled-subtitles.spec.ts` answers it.
 *
 * The globals below are stubbed rather than mocked, on the same reasoning as
 * `device-layer.test.ts`: `OffscreenCanvas`, `Worker` and the two element
 * prototypes *are* the browser, not an internal collaborator, and they are the
 * only things the gate's answer is allowed to come from.
 *
 * ## Why `requestVideoFrameCallback` is in the gate, and why that is new
 *
 * It used to be deliberately absent, because `jassub` imported `rvfc-polyfill`
 * and so brought its own. #57 took that polyfill out of the bundle — it is
 * GPL-3.0 — which hands the question back to the browser, so the gate has to
 * ask it. The versions this really decides are not hypothetical:
 * **Firefox 105-131** and **Chrome 80-82** clear every other requirement and
 * have no native `requestVideoFrameCallback` (MDN BCD: rVFC is Chrome 83 and
 * Firefox 132, `transferControlToOffscreen` is Chrome 69 and Firefox 105).
 * Without this check they would reach `renderer.ready`, resolve, and then
 * throw from inside JASSUB on the first frame — past the one place the seam
 * can still fall back to the words.
 */

/** happy-dom presents everything JASSUB needs except these. */
type BrowserStubs = {
  /** happy-dom has no `Worker` at all, so the gate needs one to get past. */
  worker?: boolean;
  /** happy-dom's `HTMLVideoElement` has no `requestVideoFrameCallback`. */
  requestVideoFrameCallback?: boolean;
  /** The one capability that cannot be polyfilled, and never could be. */
  transferControlToOffscreen?: boolean;
};

const RVFC = 'requestVideoFrameCallback';
const TRANSFER = 'transferControlToOffscreen';

const restores: (() => void)[] = [];

/**
 * Installs a browser that is JASSUB-capable except where asked otherwise, and
 * registers the undo. Everything is put back in `afterEach`, so one test's
 * browser cannot leak into the next.
 */
function withBrowser(stubs: BrowserStubs): void {
  const {
    worker = true,
    requestVideoFrameCallback = true,
    transferControlToOffscreen = true,
  } = stubs;

  if (worker) {
    const globals = globalThis as { Worker?: unknown };
    globals.Worker = class {};
    restores.push(() => {
      delete globals.Worker;
    });
  }

  if (requestVideoFrameCallback) {
    const proto = HTMLVideoElement.prototype as unknown as Record<string, unknown>;
    proto[RVFC] = function requestVideoFrameCallbackStub(): number {
      return 1;
    };
    restores.push(() => {
      delete proto[RVFC];
    });
  }

  if (!transferControlToOffscreen) {
    const proto = HTMLCanvasElement.prototype as unknown as Record<string, unknown>;
    const had = Object.getOwnPropertyDescriptor(proto, TRANSFER);
    delete proto[TRANSFER];
    restores.push(() => {
      if (had) Object.defineProperty(proto, TRANSFER, had);
    });
  }
}

/** The options the seam takes. The gate reads none of them. */
function rendererOptions() {
  return {
    video: document.createElement('video') as HTMLVideoElement,
    canvas: document.createElement('canvas'),
    content: '[Script Info]\n',
    fontUrls: [] as readonly string[],
    timeOffset: 0,
  };
}

afterEach(() => {
  while (restores.length > 0) restores.pop()?.();
});

describe('the browsers the JASSUB engine admits to running in', () => {
  /**
   * The #57 case. A browser can have the canvas transfer and still have no
   * `requestVideoFrameCallback` — that is a real window of Firefox and Chrome
   * versions, not a contrivance — and now that the polyfill is not shipped,
   * the engine has to be refused there rather than failing on the first frame.
   */
  it('refuses a browser with no requestVideoFrameCallback', async () => {
    withBrowser({ requestVideoFrameCallback: false });

    await expect(createStyledSubtitleRenderer(rendererOptions())).rejects.toThrow(
      /cannot run the styled-subtitle renderer/,
    );
  });

  /**
   * The capability that ruled JASSUB out on the Chromium 68 floor in the first
   * place (`decisions.md` §8). Here so the test above is not the only thing
   * holding the gate shut: if the gate were deleted wholesale, both fail.
   */
  it('refuses a browser that cannot transfer a canvas to a worker', async () => {
    withBrowser({ transferControlToOffscreen: false });

    await expect(createStyledSubtitleRenderer(rendererOptions())).rejects.toThrow(
      /cannot run the styled-subtitle renderer/,
    );
  });

  /** happy-dom's own shape, which is a browser with no workers at all. */
  it('refuses a browser with no Worker', async () => {
    withBrowser({ worker: false });

    await expect(createStyledSubtitleRenderer(rendererOptions())).rejects.toThrow(
      /cannot run the styled-subtitle renderer/,
    );
  });
});
