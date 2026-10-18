import { useEffect, useRef, useState } from 'preact/hooks';
import type { DeviceLayer, StyledSubtitleRenderer } from '../device/types';
import { useTranslate } from '../i18n/index';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { flattenAss } from './ass';
import type { SubtitleTrack } from './media-tracks';
import type { EmbeddedFont } from './subtitle-presentation';
import type { SubtitleCue } from './subtitle-cues';

/**
 * Styled subtitles drawn with their own styling (#29, story 104).
 *
 * The sibling of `subtitles.tsx`: that one parses a file into cues and draws
 * them itself, this one hands the file whole to a renderer — libass compiled
 * to WebAssembly — and lets it draw the fonts, colours, positions and
 * typesetting the file asks for. The player renders exactly one of the two,
 * from `subtitlePresentationFor`.
 *
 * ## A canvas, and why this one is allowed to be one
 *
 * `player-subtitles.md` §6c argues for a DOM overlay and `subtitles.tsx` takes
 * that advice: text layout, wrapping and font fallback come free and a screen
 * reader can read it. **libass is the stated exception** — it rasterises
 * glyphs itself and needs somewhere to put the pixels — so this is a canvas,
 * pinned to the same grid cell as the picture for the same reason the text
 * overlay is: inside the picture's own area, never over the controls, and
 * inside the element that goes full-screen (§6c pitfall 3).
 *
 * ## The renderer comes from the device layer
 *
 * `device.loadStyledSubtitleRenderer()`, not an `import()` here, and
 * `decisions.md` §8 is why: the engine differs per device — JASSUB on the web,
 * libass-wasm on the TV — and choosing between them means asking whether
 * `OffscreenCanvas` exists, which is exactly what `src/device/` exists to keep
 * out of here. The loading is lazy inside that call, so a couple of megabytes
 * of WebAssembly is fetched the first time a User chooses a styled track and
 * never otherwise.
 *
 * ## Two things it hands up, and one it takes down
 *
 * - **Down: the offset** (#28), given to the renderer's own `timeOffset`. The
 *   architecture note is explicit that the offset is not a feature of the text
 *   renderer, and this is the other side of that: the player holds it and this
 *   passes it on. No frame loop, because the renderer has the video element
 *   and keeps its own time against it.
 * - **Up: the cues, flattened** (`onCues`). The *renderer* draws the styled
 *   file, but "Sync to this line" has to know which line is on the screen and
 *   the player is where it lives — so the same text is flattened here, purely
 *   to be that list. It costs one pass over a file already in hand and keeps
 *   #28 working identically on both paths, which is the alternative to telling
 *   a User that the one feature this app adds stops working on its best
 *   subtitles.
 * - **Up: that it could not be done** (`onUnsupported`). A device whose
 *   capability said yes and whose engine would not load falls back to the
 *   words, because a User who asked for subtitles is owed those far more than
 *   the styling.
 */

export type StyledSubtitlesProps = {
  device: DeviceLayer;
  gateway: JellyfinGateway;
  itemId: string;
  mediaSourceId: string;
  /** The styled track to draw. */
  track: SubtitleTrack;
  /** The embedded fonts the file names (`embeddedFontsOf`). */
  fonts: readonly EmbeddedFont[];
  /** How far the subtitles are shifted (#28), in seconds, positive for later. */
  offsetSeconds?: number;
  /** The cues of the same file, flattened, for "Sync to this line". */
  onCues?: (cues: readonly SubtitleCue[]) => void;
  /** The element the subtitles are drawn over and timed against. */
  video: { current: HTMLVideoElement | null };
  /** The Server would not hand the file over, or it held nothing. */
  onUnavailable: () => void;
  /** The engine would not load. The player draws the words instead. */
  onUnsupported: () => void;
};

export function StyledSubtitles({
  device,
  gateway,
  itemId,
  mediaSourceId,
  track,
  fonts,
  offsetSeconds,
  onCues,
  video,
  onUnavailable,
  onUnsupported,
}: StyledSubtitlesProps) {
  const t = useTranslate();
  const canvas = useRef<HTMLCanvasElement | null>(null);
  /** The file itself, fetched once per track. */
  const [content, setContent] = useState<string | undefined>(undefined);

  const unavailable = useRef(onUnavailable);
  unavailable.current = onUnavailable;
  const unsupported = useRef(onUnsupported);
  unsupported.current = onUnsupported;
  const reportCues = useRef(onCues);
  reportCues.current = onCues;
  /**
   * The offset, read when the renderer is **created** rather than depended on,
   * so a User who has already shifted this file gets a renderer that opens
   * already shifted — and so that holding a button does not tear a WebAssembly
   * engine down and build it again eight times a second. Changes afterwards go
   * through `setTimeOffset` in the effect below.
   */
  const offset = useRef(0);
  offset.current = offsetSeconds ?? 0;

  /**
   * The styled file, fetched once per track. `format: 'ass'` is the Server's
   * own conversion by file extension (`jellyfin-playback.md` §14), and asking
   * for it rather than WebVTT is the whole point: the styling is in the file.
   */
  useEffect(() => {
    setContent(undefined);
    reportCues.current?.([]);

    let abandoned = false;
    void gateway
      .getSubtitleText({
        itemId,
        mediaSourceId,
        index: track.index,
        format: 'ass',
        ...(track.deliveryUrl === undefined ? {} : { deliveryUrl: track.deliveryUrl }),
      })
      .then(
        (body) => {
          if (abandoned) return;
          // Flattened for "Sync to this line" only — the renderer is handed the
          // file itself, not this.
          const flattened = flattenAss(body);
          reportCues.current?.(flattened);
          // A file the Server handed over that holds no dialogue at all is the
          // same thing to a User as one it refused, which is #27's rule.
          if (flattened.length === 0) {
            unavailable.current();
            return;
          }
          setContent(body);
        },
        () => {
          if (abandoned) return;
          unavailable.current();
        },
      );

    return () => {
      abandoned = true;
    };
    // The gateway is rebuilt on every render, so its address is the dependency.
  }, [gateway.serverAddress, itemId, mediaSourceId, track.index, track.deliveryUrl]);

  /** Where a live renderer is kept, so the offset effect can reach it. */
  const renderer = useRef<StyledSubtitleRenderer | undefined>(undefined);
  /**
   * Bumped whenever a renderer starts, so the offset effect below runs once a
   * renderer really exists rather than only when the offset changes — a User
   * who shifted the file before the engine finished loading would otherwise
   * have told nothing.
   */
  const [started, setStarted] = useState(0);

  /**
   * Loading the engine and starting it on the file. The fonts are URLs: the
   * renderer fetches them in its own worker, which is where it wants them.
   */
  useEffect(() => {
    const element = video.current;
    const surface = canvas.current;
    if (content === undefined || element === null || surface === null) return;

    let abandoned = false;
    void device
      .loadStyledSubtitleRenderer({
        video: element,
        canvas: surface,
        content,
        fontUrls: fonts.map((font) =>
          gateway.attachmentUrl({ itemId, mediaSourceId, index: font.index }),
        ),
        timeOffset: offset.current,
      })
      .then(
        (loaded) => {
          // A track changed, or the player closed, while the engine loaded.
          // Starting it now would leave a renderer nothing will ever destroy.
          if (abandoned) {
            loaded.destroy();
            return;
          }
          renderer.current = loaded;
          setStarted((count) => count + 1);
        },
        () => {
          if (abandoned) return;
          // The capability said yes and the engine would not come. The words
          // are what the User is owed, so the player is told to draw them.
          unsupported.current();
        },
      );

    return () => {
      abandoned = true;
      renderer.current?.destroy();
      renderer.current = undefined;
    };
    // `fonts` is a fresh array on every render, so its addresses are the
    // dependency rather than the array itself.
  }, [
    device,
    gateway.serverAddress,
    itemId,
    mediaSourceId,
    content,
    fonts.map((font) => font.index).join(','),
    video,
  ]);

  /**
   * The Subtitle Offset reaching the renderer (#28). A dependency rather than
   * a frame loop, unlike the text overlay: this is one cheap call into a
   * worker, the renderer keeps its own time against the video element, and
   * there is no per-frame work here to tear down.
   */
  useEffect(() => {
    renderer.current?.setTimeOffset(offsetSeconds ?? 0);
  }, [offsetSeconds, started]);

  return (
    <canvas
      class="player__styled-subtitles"
      ref={canvas}
      aria-label={t('player.subtitlesLabel')}
      role="img"
    />
  );
}
