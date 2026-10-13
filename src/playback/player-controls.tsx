import { useLayoutEffect, useRef } from 'preact/hooks';
import { useTranslate } from '../i18n/index';
import {
  formatClock,
  fractionPlayed,
  positionForFraction,
  remainingSeconds,
} from './scrubbing';

/**
 * What a User presses while something is playing (#26): the seek bar, the time
 * played and the time left, and the two buttons.
 *
 * It draws and it reports presses. It owns no playback state of its own — the
 * position and the length come from the player, which is the one place the
 * media element is touched — so this is a component a test can hand any moment
 * of a Title and read back exactly what a User would see.
 *
 * The bar is a `role="slider"` rather than an `<input type="range">`. A range
 * input is tempting, because it comes with keys and a drag for nothing, but it
 * is an `<input>`: `src/shell/back.ts` leaves a field's Backspace alone and
 * `src/navigation/focusable.ts` leaves a field's arrow keys alone, so a range
 * input with focus would quietly take Back and the arrow keys away from the
 * player. A slider is not a field, so both of those keep working, and the
 * player's own key handler is the one place a seek is decided.
 */

/** Marks the seek bar, so the player's key handler knows when it has focus. */
export const SEEK_BAR_ATTRIBUTE = 'data-player-seek';

export type PlayerControlsProps = {
  /** For every control's name, so a screen reader hears what is being paused. */
  titleName: string;
  paused: boolean;
  /** Where the picture is, in seconds. */
  position: number;
  /** How long the Title is, in seconds, where that is known yet. */
  duration?: number;
  /** Whether there is anything to control: a plan the Server agreed to. */
  ready: boolean;
  onToggle: () => void;
  /** Seek to this position, in seconds. The player clamps it. */
  onSeek: (seconds: number) => void;
  onClose: () => void;
  /**
   * Opens the track picker (#27). Absent when the Title has nothing to choose
   * between — one sound track and no subtitles — because a control that opens
   * an empty menu is a stop the arrow keys have to step through for nothing.
   */
  onOpenTracks?: () => void;
};

export function PlayerControls({
  titleName,
  paused,
  position,
  duration,
  ready,
  onToggle,
  onSeek,
  onClose,
  onOpenTracks,
}: PlayerControlsProps) {
  const t = useTranslate();
  const toggle = useRef<HTMLButtonElement | null>(null);
  const played = fractionPlayed(position, duration);
  const elapsed = formatClock(position);
  const total = formatClock(duration ?? 0);

  /**
   * Controls that appear take focus with them, unless focus is already on one
   * of the player's own. Two things need that, and they are the same thing:
   *
   * - **The player opening.** The press that opened it was the title page's
   *   Play button, and that button is still what focus is on — *behind* the
   *   player. `src/navigation/` tries the page's own flow before anything
   *   fixed, so an arrow key from there walks the title page under the picture
   *   rather than entering the player at all. Focus has to come in for the
   *   "from inside something fixed, the fixed thing is the flow" rule to
   *   apply, which is what makes the controls reachable with a remote.
   * - **The controls coming back.** Hiding them takes away whatever control
   *   focus was on and the browser hands focus to the document, so the press
   *   that reveals them has to put focus somewhere a User can see.
   *
   * A **layout** effect, so it lands with the DOM and no frame goes by with
   * the controls drawn and focus somewhere else. It waits for the negotiation
   * rather than running on mount: until the Server has said how to play the
   * Title there is nothing to pause, the button is disabled, and `focus()` on
   * a disabled button does nothing at all — which is how an earlier version of
   * this left a remote walking the title page behind the picture.
   */
  useLayoutEffect(() => {
    if (!ready) return;
    const button = toggle.current;
    const overlay = button?.closest('.player') ?? undefined;
    const active = document.activeElement;
    if (button === null || overlay === undefined) return;
    if (active !== null && overlay.contains(active)) return;
    button.focus();
  }, [ready]);

  /**
   * A press on the bar seeks to where it was pressed. Pointer only: the keys
   * are the player's, so that Left and Right seek wherever focus happens to be
   * among the controls rather than only on the bar itself.
   */
  const onBarPress = (event: MouseEvent): void => {
    // A click with no pointer behind it — `element.click()`, or a browser
    // pressing a focused control — reports (0, 0), which here would read as a
    // press on the very start of the bar and throw the User back to the
    // beginning. `detail` is how many times the pointer was clicked, and it is
    // zero for every click that was not one.
    if (event.detail === 0) return;
    const bar = event.currentTarget;
    if (!(bar instanceof HTMLElement)) return;
    const box = bar.getBoundingClientRect();
    if (box.width === 0) return;
    const wanted = positionForFraction((event.clientX - box.left) / box.width, duration);
    if (wanted !== undefined) onSeek(wanted);
  };

  return (
    <div class="player__controls">
      <div class="player__scrubber">
        <span class="player__time">{elapsed}</span>
        {/*
          `aria-valuenow` is whole seconds, which is what the readout beside it
          says: a slider announcing 125.183 would be read out in full.
        */}
        <div
          class="player__seek"
          role="slider"
          tabIndex={0}
          aria-label={t('player.seek', { name: titleName })}
          aria-valuemin={0}
          aria-valuemax={Math.floor(duration ?? 0)}
          aria-valuenow={Math.floor(position)}
          aria-valuetext={t('player.position', { elapsed, total })}
          onClick={onBarPress}
          {...{ [SEEK_BAR_ATTRIBUTE]: '' }}
        >
          <span class="player__seek-played" style={`width: ${String(played * 100)}%`} />
        </div>
        <span class="player__time">{t('player.remaining', { clock: formatClock(remainingSeconds(position, duration)) })}</span>
      </div>

      <p class="player__buttons">
        <button
          type="button"
          class="button button--primary"
          ref={toggle}
          disabled={!ready}
          onClick={onToggle}
        >
          {paused ? t('player.play', { name: titleName }) : t('player.pause', { name: titleName })}
        </button>
        {/*
          The sound and the subtitles (#27). Named with the Title like every
          other control here, and only drawn when the Title has something to
          choose between — see the note on `onOpenTracks`.
        */}
        {onOpenTracks === undefined ? null : (
          <button
            type="button"
            class="button button--quiet"
            disabled={!ready}
            /*
              The *name* carries the Title, as every control here does, but the
              visible text does not: "Audio and subtitles for The Unfinished"
              on a button is wider than a phone, and this row has three buttons
              in it now. A screen reader still hears which Title's tracks are
              being changed.
            */
            aria-label={t('player.tracks', { name: titleName })}
            onClick={onOpenTracks}
          >
            {t('player.tracksLabel')}
          </button>
        )}
        <button type="button" class="button button--quiet" onClick={onClose}>
          {t('player.close')}
        </button>
      </p>
    </div>
  );
}
