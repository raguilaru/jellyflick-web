import { useEffect, useRef, useState } from 'preact/hooks';
import { useTranslate } from '../i18n/index';
import type { JellyfinGateway } from '../jellyfin/gateway';
import type { SubtitleTrack } from './media-tracks';
import { createCueCursor, parseSubtitles, type SubtitleCue } from './subtitle-cues';

/**
 * The subtitles drawn over the picture (#27).
 *
 * Two jobs, and they are separate on purpose: **fetching and parsing a track**
 * happens once when the track changes, and **deciding what is on the screen**
 * happens on every frame. `subtitle-cues.ts` is both halves' arithmetic; this
 * is the DOM around it.
 *
 * ## A DOM overlay, not a canvas
 *
 * `player-subtitles.md` §6c recommends a positioned `div`: text layout,
 * wrapping and font fallback come free, it scales with CSS, and a screen reader
 * can read it. A canvas is for PGS bitmaps (#30) and for libass (#29), which
 * need one.
 *
 * It is a **sibling of the `<video>` inside the player**, never inside the
 * video element, which is §6c pitfall 3: the browser draws native cues inside
 * the video, and an app-drawn overlay has to live inside whatever goes
 * full-screen or it disappears the moment it does. The player is the
 * full-screen element, so this belongs there.
 *
 * ## Why a frame loop rather than the element's events
 *
 * `timeupdate` fires about four times a second, which is a quarter-second of
 * visible lag on a cue; and the Subtitle Offset (#28) has to take effect while
 * a User is holding a button, which means within a frame. §6c settles it:
 * drive from `requestAnimationFrame` against a clock the app controls. That is
 * also why the position comes from the element here rather than from the
 * player's own `position` state, which is the four-times-a-second one the seek
 * bar draws with.
 *
 * ## The seam #28 takes over
 *
 * The loop reads the position and asks the cursor for that moment. An offset is
 * one subtraction on the way in — `cursor.at(element.currentTime - offset)` —
 * and nothing else here or in `subtitle-cues.ts` changes. The cursor is correct
 * for any position rather than only an increasing one, which is exactly what a
 * User dragging an offset back and forth needs.
 */

export type SubtitlesProps = {
  gateway: JellyfinGateway;
  itemId: string;
  mediaSourceId: string;
  /** The track to draw. Absent draws nothing, which is subtitles off. */
  track?: SubtitleTrack;
  /** The element whose position the cues are read against. */
  video: { current: HTMLVideoElement | null };
  /** Said once, so the player can show it in the picker where the press was. */
  onUnavailable: () => void;
};

/**
 * The format asked for. `jellyfin-playback.md` §14: the Server converts on the
 * fly and the format **is** the file extension, so one request gets a VTT out
 * of SubRip, MicroDVD or anything else text it holds — which is why there is no
 * per-codec branch here. A graphical track never reaches this component; the
 * picker will not offer one (`media-tracks.ts`).
 */
const SUBTITLE_FORMAT = 'vtt';

export function Subtitles({
  gateway,
  itemId,
  mediaSourceId,
  track,
  video,
  onUnavailable,
}: SubtitlesProps) {
  const t = useTranslate();
  const [cues, setCues] = useState<readonly SubtitleCue[]>([]);
  const [text, setText] = useState('');
  const unavailable = useRef(onUnavailable);
  unavailable.current = onUnavailable;

  /**
   * The track, fetched and parsed once. The gateway does the fetching because
   * nothing outside `src/jellyfin/` calls `fetch` — which also sidesteps §6c
   * pitfall 4, a cross-origin `<track src>` that fails silently, since the
   * Server is another origin in every real deployment.
   */
  useEffect(() => {
    setCues([]);
    setText('');
    if (track === undefined) return;

    let abandoned = false;
    void gateway
      .getSubtitleText({
        itemId,
        mediaSourceId,
        index: track.index,
        format: SUBTITLE_FORMAT,
        ...(track.deliveryUrl === undefined ? {} : { deliveryUrl: track.deliveryUrl }),
      })
      .then(
        (body) => {
          if (abandoned) return;
          const parsed = parseSubtitles(body);
          setCues(parsed);
          // A track the Server handed over but that held no cues is the same
          // thing to a User as one it refused: there is nothing to read.
          if (parsed.length === 0) unavailable.current();
        },
        () => {
          if (abandoned) return;
          // Swallowed, like a failed progress report: a Server that will not
          // hand over subtitles has not cost the User their film.
          unavailable.current();
        },
      );

    return () => {
      abandoned = true;
    };
    // The gateway is rebuilt on every render, so its address is the dependency.
  }, [gateway.serverAddress, itemId, mediaSourceId, track?.index, track?.deliveryUrl]);

  /**
   * The frame loop. It runs only while there are cues, so a Title with
   * subtitles off costs nothing at all, and it sets state only when the text
   * really changes — a `setState` with the same string on every frame would
   * re-render the whole player sixty times a second.
   */
  useEffect(() => {
    if (cues.length === 0) return;
    const cursor = createCueCursor(cues);
    let frame = 0;
    let showing = '';

    const tick = (): void => {
      const element = video.current;
      if (element !== null) {
        // Where #28's offset is subtracted, and the only change it needs here.
        const wanted = cursor
          .at(element.currentTime)
          .map((cue) => cue.text)
          .join('\n');
        if (wanted !== showing) {
          showing = wanted;
          setText(wanted);
        }
      }
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
    };
  }, [cues, video]);

  // Nothing at all rather than an empty box: a cue-shaped gap over the picture
  // is the same mistake as controls that are merely transparent.
  if (text === '') return null;

  return (
    <div class="player__subtitles" aria-label={t('player.subtitlesLabel')}>
      {/*
        One element per line, so a two-line cue is two lines without the overlay
        having to parse anything. The text is already plain — `subtitle-cues.ts`
        strips every tag — and Preact sets it as text, so a subtitle file out of
        a media library can never become markup. Both halves of that are
        deliberate; §6c calls this a genuine XSS vector.
      */}
      {text.split('\n').map((line, at) => (
        <span key={at} class="player__subtitle-line">
          {line}
        </span>
      ))}
    </div>
  );
}
