import { useLayoutEffect, useRef } from 'preact/hooks';
import { useTranslate, type Translate } from '../i18n/index';
import { useBackClaim } from '../shell/back';
import type { AudioTrack, MediaTracks, SubtitleTrack } from './media-tracks';

/**
 * The sound and the subtitles, chosen while something is playing (#27).
 *
 * It draws and it reports presses, exactly as `PlayerControls` does: the player
 * owns which track is playing, so there is one path to a switch and this
 * component can be handed any state a test likes.
 *
 * **Every choice is a `<button>` with `aria-pressed`, never a radio group.**
 * That is the same call `settings-screen.tsx` made and for the same reason: a
 * native radio takes Left and Right for itself to move the selection, and
 * `src/navigation/` owns the arrow keys for moving focus. Two meanings for one
 * key press, on the screen most likely to be driven with a remote, is the thing
 * being avoided — and buttons serve touch, mouse and remote at once.
 *
 * **It claims Back on top of the player's claim.** `src/shell/back.ts` keeps
 * the claims innermost-last, so Back closes this menu and leaves the player
 * playing, and neither of the two has to know about the other. The player's own
 * note says this is what that extension point is for.
 *
 * **It is `position: fixed` inside the player, which is also fixed.** From
 * inside something fixed, that fixed thing is the arrow keys' flow
 * (`src/navigation/`, `fixedRootOf`), so focus stays inside this menu while it
 * is open with no focus-trapping code — the title page's pop-up and the player
 * itself already lean on the same rule.
 */

/**
 * Note there is deliberately no Title name here, unlike every *control* in the
 * player. The control that opens this menu carries it ("Audio and subtitles for
 * Arrival"); the menu itself does not, because a User reading it is already
 * inside the thing that was named.
 */
export type TrackPickerProps = {
  tracks: MediaTracks;
  /** Which sound is playing, by `MediaStream.Index`. */
  audioIndex?: number;
  /** Which subtitles are being drawn. Absent is "off", which is a real choice. */
  subtitleIndex?: number;
  /** Whether the Server refused the subtitle track the User chose. */
  subtitlesUnavailable: boolean;
  onChooseAudio: (index: number) => void;
  /** `undefined` turns subtitles off. */
  onChooseSubtitle: (index: number | undefined) => void;
  onClose: () => void;
};

export function TrackPicker({
  tracks,
  audioIndex,
  subtitleIndex,
  subtitlesUnavailable,
  onChooseAudio,
  onChooseSubtitle,
  onClose,
}: TrackPickerProps) {
  const t = useTranslate();
  const panel = useRef<HTMLDivElement | null>(null);

  // Back closes the menu and nothing else, through the one Back handler.
  useBackClaim(true, onClose);

  /**
   * Focus comes in with the menu, for the reason `player-controls.tsx` gives
   * about the controls themselves: the press that opened it was on a button
   * the menu is now drawn over, and the flow rule above only applies to focus
   * that is *inside* the fixed thing. A layout effect, so no frame goes by
   * with the menu drawn and focus behind it.
   */
  useLayoutEffect(() => {
    const first = panel.current?.querySelector('button');
    if (first instanceof HTMLElement) first.focus();
  }, []);

  /** Whether any track the Title holds is one this app cannot draw. */
  const hasImageSubtitles = tracks.subtitles.some((track) => track.kind === 'image');

  return (
    <div
      class="player__tracks"
      role="dialog"
      aria-modal="true"
      aria-label={t('player.tracksLabel')}
      ref={panel}
    >
      {tracks.audio.length > 0 ? (
        <div class="player__track-group" role="group" aria-label={t('player.audioTracks')}>
          <h2 class="player__track-heading">{t('player.audioTracks')}</h2>
          <div class="player__track-choices">
            {tracks.audio.map((track) => (
              <button
                key={track.index}
                type="button"
                class="button button--quiet"
                aria-pressed={track.index === audioIndex}
                onClick={() => onChooseAudio(track.index)}
              >
                {nameOfTrack(track, t)}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div class="player__track-group" role="group" aria-label={t('player.subtitleTracks')}>
        <h2 class="player__track-heading">{t('player.subtitleTracks')}</h2>
        <div class="player__track-choices">
          {/*
            Off is first and is a choice like any other, rather than the absence
            of one: a User turning subtitles off has pressed something, and it
            has to be pressable with a remote like everything else here.
          */}
          <button
            type="button"
            class="button button--quiet"
            aria-pressed={subtitleIndex === undefined}
            onClick={() => onChooseSubtitle(undefined)}
          >
            {t('player.subtitlesOff')}
          </button>
          {tracks.subtitles.map((track) => {
            const drawable = track.kind === 'text';
            return (
              <button
                key={track.index}
                type="button"
                class="button button--quiet"
                aria-pressed={track.index === subtitleIndex}
                /*
                  `aria-disabled` rather than `disabled`: a disabled button is
                  not a focus stop at all, so a remote would skip past a track
                  with no way to find out why it was not offered. This one is
                  reachable, named, and says what it is — and the group's own
                  note says Jellyflick cannot draw it yet.
                */
                aria-disabled={drawable ? undefined : 'true'}
                onClick={drawable ? () => onChooseSubtitle(track.index) : undefined}
              >
                {nameOfTrack(track, t)}
              </button>
            );
          })}
        </div>
        {hasImageSubtitles ? <p class="notice">{t('player.subtitlesImage')}</p> : null}
        {subtitlesUnavailable ? (
          <p class="notice notice--problem" role="alert">
            {t('player.subtitlesUnavailable')}
          </p>
        ) : null}
      </div>

      <p class="player__buttons">
        <button type="button" class="button button--primary" onClick={onClose}>
          {t('player.tracksDone')}
        </button>
      </p>
    </div>
  );
}

/**
 * What to call a track.
 *
 * `DisplayTitle` first, because it is the **Server's** own label — it names the
 * language, the codec and the channel count, it is what every other Jellyfin
 * app shows for that track, and it is data rather than a string of ours, like a
 * Title's name. A track the Server gave no label falls back to its language's
 * translated name, and one with neither to its index, which at least tells two
 * nameless tracks apart.
 */
function nameOfTrack(track: AudioTrack | SubtitleTrack, t: Translate): string {
  if (track.label !== undefined) return track.label;
  if (track.language !== undefined) return t('title.language', { code: track.language });
  return t('player.trackUnnamed', { index: track.index });
}
