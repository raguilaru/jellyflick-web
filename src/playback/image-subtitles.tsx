import { useEffect, useRef, useState } from 'preact/hooks';
import type { DeviceLayer, ImageSubtitleRenderer } from '../device/types';
import { useTranslate } from '../i18n/index';
import type { JellyfinGateway } from '../jellyfin/gateway';
import type { SubtitleTrack } from './media-tracks';

/**
 * Image subtitles drawn on this device (#30, story 105).
 *
 * The third of the player's three subtitle overlays, and the simplest of them.
 * `subtitles.tsx` fetches a text file, parses it and draws the words itself;
 * `styled-subtitles.tsx` fetches a styled file and hands it to libass;
 * this one hands a renderer an **address** and gets out of the way. The player
 * renders exactly one of the three, from `subtitlePresentationFor`.
 *
 * ## Why so much less happens here
 *
 * Three of the jobs the other two do have no counterpart in a bitmap, and
 * noticing that is most of the design:
 *
 * - **Nothing is fetched here.** A `.sup` is binary and libpgs would rather
 *   fetch it in the worker that decodes it, so the gateway is asked for a URL
 *   rather than a body. The one consequence worth knowing is that a failure is
 *   reported through the renderer's own promise rather than through a `catch`
 *   on a fetch — and that **nothing watching the page sees the request**,
 *   which is why `test/e2e/image-subtitles.spec.ts` reads the fake's own
 *   request log instead.
 * - **No cues go up.** `onCues` is how the other two let "Sync to this line"
 *   (#28, story 100) know which line is on the screen, and a PGS stream has no
 *   line: it is a sequence of pictures with no text in them at all. So the
 *   button stays unoffered while a PGS track is drawn, which is the honest
 *   answer rather than a missing feature — the Subtitle Offset itself still
 *   works, and that is the half a User came for.
 * - **No fallback.** A styled track that will not style still has words
 *   underneath it, so #29 falls back to the overlay. Here the bitmap *is* the
 *   subtitle, so a decoder that will not load leaves nothing to draw and the
 *   player says so beside the picture.
 *
 * ## The canvas
 *
 * §6c's exception again, for the same reason as #29's: these are pixels, not
 * text, so there is nothing for a DOM overlay to lay out. It shares the
 * picture's own grid cell — never over the controls, inside the element that
 * goes full-screen — and **fills** it rather than sitting at the bottom,
 * because a PGS display set carries absolute coordinates inside the video's
 * frame and places its own lines. `aspectRatio: 'contain'` in the renderer
 * matches `.player__video`'s `object-fit`, so the two letterbox alike.
 */

export type ImageSubtitlesProps = {
  device: DeviceLayer;
  gateway: JellyfinGateway;
  itemId: string;
  mediaSourceId: string;
  /** The PGS track to draw. */
  track: SubtitleTrack;
  /** How far the subtitles are shifted (#28), in seconds, positive for later. */
  offsetSeconds?: number;
  /** The element the subtitles are drawn over and timed against. */
  video: { current: HTMLVideoElement | null };
  /** The decoder would not load, or the Server would not hand the stream over. */
  onUnavailable: () => void;
};

export function ImageSubtitles({
  device,
  gateway,
  itemId,
  mediaSourceId,
  track,
  offsetSeconds,
  video,
  onUnavailable,
}: ImageSubtitlesProps) {
  const t = useTranslate();
  const canvas = useRef<HTMLCanvasElement | null>(null);

  const unavailable = useRef(onUnavailable);
  unavailable.current = onUnavailable;
  /**
   * The offset, read when the renderer is **created** rather than depended on,
   * exactly as #29 does it: a User who has already shifted this file gets a
   * renderer that opens shifted, and a held button does not tear a decoder and
   * its worker down eight times a second. Changes afterwards go through
   * `setTimeOffset` in the effect below.
   */
  const offset = useRef(0);
  offset.current = offsetSeconds ?? 0;

  /** Where a live renderer is kept, so the offset effect can reach it. */
  const renderer = useRef<ImageSubtitleRenderer | undefined>(undefined);
  /**
   * Bumped whenever a renderer starts, so the offset effect below runs once a
   * renderer really exists rather than only when the offset changes — a User
   * who shifted the stream while the decoder was loading would otherwise have
   * told nothing.
   */
  const [started, setStarted] = useState(0);

  /**
   * Loading the decoder and starting it on the stream.
   *
   * `format: 'sup'` is the honest extension and not a conversion at all: §14's
   * graphical passthrough refuses to parse or rewrite a bitmap and hands the
   * raw file over whatever was asked for, so asking for `sup` is the only way
   * the response's content type matches what really arrives.
   */
  useEffect(() => {
    const element = video.current;
    const surface = canvas.current;
    if (element === null || surface === null) return;

    let abandoned = false;
    void device
      .loadImageSubtitleRenderer({
        video: element,
        canvas: surface,
        subtitleUrl: gateway.subtitleStreamUrl({
          itemId,
          mediaSourceId,
          index: track.index,
          format: 'sup',
          ...(track.deliveryUrl === undefined ? {} : { deliveryUrl: track.deliveryUrl }),
        }),
        timeOffset: offset.current,
      })
      .then(
        (loaded) => {
          // A track changed, or the player closed, while the decoder loaded.
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
          /*
           * Either the decoder would not load or the Server would not hand the
           * stream over, and the two are **deliberately one message**: libpgs
           * reports both through the same promise, and a User can act on
           * neither differently. What they are owed is knowing the subtitles
           * they asked for are not coming, which is #27's rule for a track the
           * Server refused and is said in the same place — beside the picture,
           * because the press that chose this track also closed the picker.
           */
          unavailable.current();
        },
      );

    return () => {
      abandoned = true;
      renderer.current?.destroy();
      renderer.current = undefined;
    };
    // The gateway is rebuilt on every render, so its address is the dependency.
  }, [
    device,
    gateway.serverAddress,
    itemId,
    mediaSourceId,
    track.index,
    track.deliveryUrl,
    video,
  ]);

  /**
   * The Subtitle Offset reaching the renderer (#28) — one cheap call, not a
   * frame loop: libpgs holds the video element and re-renders the moment the
   * offset moves it to.
   */
  useEffect(() => {
    renderer.current?.setTimeOffset(offsetSeconds ?? 0);
  }, [offsetSeconds, started]);

  return (
    <canvas
      class="player__image-subtitles"
      ref={canvas}
      aria-label={t('player.subtitlesLabel')}
      role="img"
    />
  );
}
