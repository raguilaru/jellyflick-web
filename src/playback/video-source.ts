import type { VideoCapabilities } from '../device/types';
import type { PlaybackPlan } from './planning';

/**
 * Getting a plan into a `<video>`.
 *
 * Three cases, and the third is the only one that costs anything:
 *
 * 1. **A file** — a direct play, or a progressive transcode — goes straight onto
 *    the element's `src`.
 * 2. **An HLS playlist on a device with its own HLS player** also goes straight
 *    onto `src`. A phone and a TV with a native player need no library at all.
 * 3. **An HLS playlist anywhere else** needs hls.js over Media Source
 *    Extensions.
 *
 * **hls.js is loaded only in that third case**, through one `import()`, which is
 * what makes it a chunk of its own rather than part of the bundle a TV downloads
 * to show Home. It is the largest dependency in the project by a wide margin and
 * the spec's lightness constraint is about exactly that bundle, so this is the
 * first thing in the app that is lazily loaded — see `architecture.md`.
 *
 * `decisions.md` §8 says to call `Hls.isSupported()` before `canPlayType()`,
 * because `canPlayType` answers a truthy `"maybe"` for HLS in Chrome even
 * though it cannot play one. That order is already kept, one level down: the
 * device layer only claims `playsHlsNatively` when there is no Media Source to
 * prefer (`src/device/browser.ts`), so a Chrome that lies about `canPlayType`
 * never reaches case 2. The full build, not `hls.light`, because light drops
 * alternate audio and subtitles, which #27 needs.
 */

/** As much of hls.js as this module uses. */
export type HlsModule = {
  default: {
    new (): {
      loadSource(url: string): void;
      attachMedia(media: HTMLMediaElement): void;
      destroy(): void;
    };
    isSupported(): boolean;
  };
};

export type AttachedSource = {
  /**
   * Lets go of the source. Not optional housekeeping: an element left with a
   * `src` goes on downloading, and an hls.js instance left alive goes on
   * pulling segments, which keeps the Server transcoding for nobody.
   */
  detach(): void;
  /** Whether hls.js was loaded for this source, which a test can see. */
  usingHlsJs: boolean;
};

export type AttachOptions = {
  capabilities: VideoCapabilities;
  /** Injected so a test can see whether the chunk was fetched at all. */
  loadHls?: () => Promise<HlsModule>;
};

/** The one `import()` in the app, and the reason there is a second chunk. */
const importHls = (): Promise<HlsModule> => import('hls.js') as unknown as Promise<HlsModule>;

export async function attachPlaybackSource(
  video: HTMLVideoElement,
  plan: PlaybackPlan,
  options: AttachOptions,
): Promise<AttachedSource> {
  const { capabilities } = options;

  const needsLibrary =
    plan.delivery === 'hls' && !capabilities.playsHlsNatively && capabilities.hasMediaSource;

  if (needsLibrary) {
    const load = options.loadHls ?? importHls;
    const module = await load();
    if (module.default.isSupported()) {
      const hls = new module.default();
      hls.attachMedia(video);
      hls.loadSource(plan.url);
      return {
        usingHlsJs: true,
        detach: () => {
          hls.destroy();
        },
      };
    }
    // It said it cannot run here. Handing the playlist to the element is a
    // better last try than a black screen with nothing attempted; the player
    // shows whatever the element's own `error` event says.
  }

  video.src = plan.url;
  return {
    usingHlsJs: false,
    detach: () => {
      video.removeAttribute('src');
      // Without this the element keeps the last network state, and some
      // browsers go on buffering what was there.
      video.load();
    },
  };
}
