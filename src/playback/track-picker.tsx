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
  /**
   * Opens the Subtitle timing panel (#28), which story 96 reaches "from the
   * subtitle menu". **Absent when there is nothing to time** — subtitles off,
   * or a track this app is not drawing — because a control that opens a panel
   * about nothing is a focus stop the arrow keys step through for nothing, the
   * same call `PlayerControls` makes about this menu itself.
   *
   * #30 is where the third case arrives, and it is **not** absence:
   * `subtitlesBurnedIn` below keeps the control on the screen and disables it,
   * because there is something to say about it.
   */
  onOpenTiming?: () => void;
  /**
   * Whether the Server drew the subtitles into the picture (#30), which is the
   * ticket's "the offset control is disabled with an explanation".
   *
   * It is deliberately **not** the absence of `onOpenTiming` above. A track
   * that is off has nothing to time and nothing to say about it, so the
   * control is simply not there; a burned-in track is a track a User is
   * watching and may well want to shift, so the control stays, carrying
   * `aria-disabled`, and the group says why. That is the same treatment an
   * undrawable track used to get here — `aria-disabled` rather than
   * `disabled`, so a remote can reach it and read the reason instead of
   * skipping silently past a control that was never explained.
   */
  subtitlesBurnedIn?: boolean;
  onClose: () => void;
};

export function TrackPicker({
  tracks,
  audioIndex,
  subtitleIndex,
  subtitlesUnavailable,
  onChooseAudio,
  onChooseSubtitle,
  onOpenTiming,
  subtitlesBurnedIn = false,
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
   *
   * **And it goes back out with it** (#53), which is the half this menu was
   * missing: `playback-options.tsx` has the same two lines for the same reason
   * and its note has the argument in full. The short of it — every way out of
   * here removes the focused element (Done, Back, and a subtitle choice that
   * needs no re-negotiation), so a browser hands focus to the **document**,
   * and from there the arrow keys are not inside the player at all and the
   * next press walks the title page behind the picture (#7, #40).
   *
   * The opener is only focused again if it is **still there**. Choosing a
   * different sound track, or a subtitle track the Server has to burn into the
   * picture (#30), re-negotiates and rebuilds the whole control row — so the
   * button this was opened from is detached by the time this unmounts, and
   * focusing a detached node is the very thing being avoided. The controls'
   * own effect, which takes focus when they come back, is the right thing to
   * leave that case to.
   */
  useLayoutEffect(() => {
    const opener = document.activeElement;
    const first = panel.current?.querySelector('button');
    if (first instanceof HTMLElement) first.focus();
    return () => {
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  /*
   * There is no longer any such thing as a subtitle track this app will not
   * put on the screen (#30), which is why nothing here is `aria-disabled` any
   * more. A picture track is either decoded here or burned into the picture by
   * the Server, and both of those are the words appearing — so the "Jellyflick
   * cannot draw picture subtitles yet" notice and the unpressable buttons that
   * went with it are both gone. What is left to say is said about the *chosen*
   * track, below, and only when there is something to say.
   */

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
          {tracks.subtitles.map((track) => (
            <button
              key={track.index}
              type="button"
              class="button button--quiet"
              aria-pressed={track.index === subtitleIndex}
              onClick={() => onChooseSubtitle(track.index)}
            >
              {nameOfTrack(track, t)}
            </button>
          ))}
        </div>
        {/*
          Subtitle timing (#28). It sits in the subtitles group rather than
          among the choices, because it is not a track: it is what to do with
          the one that is playing.
        */}
        {onOpenTiming === undefined ? null : (
          <p class="player__buttons">
            <button
              type="button"
              class="button button--quiet"
              /*
                Burned in, so there is nothing left to shift: the Server has
                already drawn the words into the frames, and the one thing the
                panel does is subtract a number from a cue's time. Offered and
                `aria-disabled` rather than removed, because a User watching a
                track they might well want to shift is owed the reason — which
                the group's note gives, directly below.
              */
              aria-disabled={subtitlesBurnedIn ? 'true' : undefined}
              onClick={subtitlesBurnedIn ? undefined : onOpenTiming}
            >
              {t('player.subtitleTiming')}
            </button>
          </p>
        )}
        {subtitlesBurnedIn ? <p class="notice">{t('player.subtitlesBurnedIn')}</p> : null}
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
