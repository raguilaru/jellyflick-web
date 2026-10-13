import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import type { DeviceLayer } from '../device/types';
import { useTranslate } from '../i18n/index';
import { useBackClaim } from '../shell/back';

/**
 * The Subtitle timing panel (#28, stories 96–101): the readout, the two step
 * buttons, Reset and "Sync to this line".
 *
 * It draws and it reports presses, exactly as `PlayerControls` and
 * `TrackPicker` do. The offset in force lives in the player, which is also the
 * one place it is saved from, so this component can be handed any state a test
 * likes and has no idea the Server exists.
 *
 * ## It does not cover the subtitle line, and that is the layout's whole job
 *
 * Story 101: a User adjusting the subtitles has to be able to *see* them. The
 * panel is therefore anchored to the **top** of the player — `base.css` — where
 * the cues are anchored to the bottom of the picture and the controls are the
 * player's second grid row. Nothing here overlaps either. It is the one
 * acceptance criterion in this ticket that is checked by looking at a laid-out
 * screen, which is why `test/e2e/the-subtitle-offset.spec.ts` measures the two
 * boxes rather than trusting this note.
 *
 * ## It never pauses the picture
 *
 * Story 96: the video keeps playing while the panel is open, so the User sees
 * the result live. There is nothing here that touches the media element —
 * which is the player's alone — and the player's "keep the controls up" rule
 * deliberately does **not** list this panel, because a paused player is the one
 * thing this panel must not look like.
 *
 * `role="dialog"` without `aria-modal`: the picture behind it is still playing
 * and still the thing being adjusted, so telling a screen reader the rest of
 * the screen is inert would be a lie. Focus still stays inside it, because it
 * is `position: fixed` inside the player, which is also fixed — from inside
 * something fixed the fixed thing is the arrow keys' flow (`fixedRootOf` in
 * `src/navigation/`), the rule #17's pop-up and the track picker already lean
 * on, with no focus-trapping code of ours.
 *
 * ## Left and Right are taken here, not from `window`
 *
 * Story 98. The keys are handled on the panel's own element, so they are the
 * panel's only while focus is inside it, and `preventDefault` is what takes
 * them off `src/navigation/` — which leaves a `keydown` whose default has been
 * prevented alone. The player's own handler does not have to know: with the
 * controls up it leaves Left and Right alone unless they arrived on the seek
 * bar, and its listener is on `window` in the capture phase, so it runs before
 * this one and declines.
 *
 * Up and Down stay the navigator's, which is how a remote reaches Reset, Sync
 * and Done — the same split the seek bar makes.
 */

/** How long a button is held before it starts repeating. */
export const HOLD_FIRST_REPEAT_MS = 400;
/** How often it repeats after that. */
export const HOLD_REPEAT_MS = 120;

/**
 * How many steps one repeat takes, by how many have already gone.
 *
 * Story 97's "repeats faster when held": a tenth at a time for the first
 * second or so, then two, then half a second a tick, so a User can creep up on
 * a small mistiming or cross several seconds of a badly muxed file with one
 * thumb. The ramp is in steps rather than in the interval so every stage still
 * lands on the tenth-of-a-second grid the readout prints.
 */
function stepsForRepeat(repeats: number): number {
  if (repeats < 8) return 1;
  if (repeats < 16) return 2;
  return 5;
}

export type SubtitleTimingProps = {
  /** The offset in force, in seconds, positive for subtitles later. */
  offsetSeconds: number;
  /** For the logical keys, so a remote is mapped once in `src/device/`. */
  device: DeviceLayer;
  /** Shift by this many steps of a tenth of a second; negative is earlier. */
  onShift: (steps: number) => void;
  onReset: () => void;
  /**
   * Sync to the line on the screen. **Absent when there is no line**, which is
   * nothing to sync to — the button stays and says so rather than disappearing.
   */
  onSyncToLine?: () => void;
  /**
   * An adjustment has finished: a button let go, a key let go, or one press of
   * Reset or Sync. It is what the offset is **saved** on, because a Client
   * Settings write is a read-modify-write against the Server and a held button
   * is forty steps.
   */
  onSettled: () => void;
  onClose: () => void;
};

export function SubtitleTiming({
  offsetSeconds,
  device,
  onShift,
  onReset,
  onSyncToLine,
  onSettled,
  onClose,
}: SubtitleTimingProps) {
  const t = useTranslate();
  /**
   * Said only after a User has pressed Sync with nothing on the screen.
   *
   * Showing it whenever there is no line would mean a notice blinking on and
   * off through every pause in the dialogue, right where the User is reading a
   * number. `aria-disabled` is what says the button cannot be pressed; this is
   * what says why, to whoever asked.
   */
  const [sayWhyNoSync, setSayWhyNoSync] = useState(false);

  // Back closes the panel and leaves the Title playing, through the one Back
  // handler. The claim stack is innermost-last, so this sits on top of the
  // player's own claim exactly as the track picker's does.
  useBackClaim(true, onClose);

  const held = useRef<HTMLDivElement | null>(null);

  /**
   * Focus comes in with the panel, for the reason `track-picker.tsx` gives
   * about itself: the press that opened it was on a button the panel is now
   * drawn over, and the "from inside something fixed, the fixed thing is the
   * flow" rule only applies to focus that is already *inside* it. Without
   * this, Left and Right would still be the navigator's and would walk the
   * controls behind the panel — story 98 would not work at all.
   *
   * A layout effect, so no frame goes by with the panel drawn and focus behind
   * it. The first button is the one the arrows arrive from, which is `−`.
   */
  useLayoutEffect(() => {
    const first = held.current?.querySelector('button');
    if (first instanceof HTMLElement) first.focus();
  }, []);

  const hold = useRef<{ timer: number; repeats: number } | undefined>(undefined);
  /** Whether a pointer began this press, so the click that follows is not a second one. */
  const fromPointer = useRef(false);

  const stopHolding = (): void => {
    const held = hold.current;
    if (held === undefined) return;
    window.clearTimeout(held.timer);
    hold.current = undefined;
  };

  // Nothing may outlive the panel: a repeat still running after it closed would
  // be shifting an offset nobody can see.
  useEffect(() => stopHolding, []);

  const startHolding = (steps: number): void => {
    stopHolding();
    fromPointer.current = true;
    onShift(steps);

    const tick = (): void => {
      const held = hold.current;
      if (held === undefined) return;
      onShift(steps * stepsForRepeat(held.repeats));
      held.repeats += 1;
      held.timer = window.setTimeout(tick, HOLD_REPEAT_MS);
    };
    hold.current = { repeats: 0, timer: window.setTimeout(tick, HOLD_FIRST_REPEAT_MS) };
  };

  /** A press let go, however it was let go: stop, and let the player save. */
  const releaseHold = (): void => {
    if (hold.current === undefined) return;
    stopHolding();
    onSettled();
  };

  /**
   * One step from a press that was not a pointer's — Enter or Space on the
   * focused button. A browser fires `click` for a tap as well, so a press that
   * began with `pointerdown` is skipped here or one tap would move two tenths.
   */
  const clickStep = (steps: number): void => {
    if (fromPointer.current) {
      fromPointer.current = false;
      return;
    }
    onShift(steps);
    onSettled();
  };

  const step = (steps: number, label: string, glyph: string) => (
    <button
      type="button"
      class="button button--quiet player__timing-step"
      aria-label={label}
      onPointerDown={() => startHolding(steps)}
      onPointerUp={releaseHold}
      onPointerLeave={releaseHold}
      onPointerCancel={releaseHold}
      onClick={() => clickStep(steps)}
    >
      {glyph}
    </button>
  );

  return (
    <div
      class="player__timing"
      role="dialog"
      aria-label={t('player.subtitleTiming')}
      ref={held}
      onKeyDown={(event) => {
        const key = device.keyFor(event);
        if (key !== 'Left' && key !== 'Right') return;
        // Taken from `src/navigation/`, which leaves a prevented key alone:
        // without this the same press would also move focus.
        event.preventDefault();
        onShift(key === 'Right' ? 1 : -1);
      }}
      onKeyUp={(event) => {
        const key = device.keyFor(event);
        if (key === 'Left' || key === 'Right') onSettled();
      }}
    >
      {/*
        Earlier on the left, the readout between them, later on the right: Left
        and Right then mean the same thing whether a User presses the key or
        the button under it, and the readout is between the two things that
        move it. The buttons are pinned to the panel's own edges rather than
        sitting either side of a word that changes length, so stepping from
        "in sync" to "0.1 s later" does not move what is under the thumb.
      */}
      <div class="player__timing-adjust">
        {step(-1, t('player.subtitlesStepEarlier'), '−')}
        {/*
          The readout story 99 asks for. It is `role="status"`, so a screen
          reader hears the number settle without the panel having to announce
          every tenth of a held button — a polite region is coalesced, where a
          fresh `aria-label` on each step would not be.
        */}
        <p class="player__timing-readout" role="status">
          {offsetSeconds === 0
            ? t('player.subtitlesInSync')
            : offsetSeconds > 0
              ? t('player.subtitlesLater', { seconds: offsetSeconds })
              : t('player.subtitlesEarlier', { seconds: -offsetSeconds })}
        </p>
        {step(1, t('player.subtitlesStepLater'), '+')}
      </div>

      <p class="player__buttons">
        <button
          type="button"
          class="button button--quiet"
          /*
            `aria-disabled` rather than `disabled`, the call the track picker
            made for a track it cannot draw: a disabled button is not a focus
            stop at all, so a remote would skip past it with no way to find out
            why it was not offered.
          */
          aria-disabled={onSyncToLine === undefined ? 'true' : undefined}
          onClick={() => {
            if (onSyncToLine === undefined) {
              setSayWhyNoSync(true);
              return;
            }
            setSayWhyNoSync(false);
            onSyncToLine();
            onSettled();
          }}
        >
          {t('player.subtitleSyncToLine')}
        </button>
        <button
          type="button"
          class="button button--quiet"
          onClick={() => {
            onReset();
            onSettled();
          }}
        >
          {t('player.subtitleTimingReset')}
        </button>
        <button type="button" class="button button--primary" onClick={onClose}>
          {t('player.subtitleTimingDone')}
        </button>
      </p>

      {sayWhyNoSync && onSyncToLine === undefined ? (
        <p class="notice" role="alert">
          {t('player.subtitleSyncUnavailable')}
        </p>
      ) : null}
    </div>
  );
}
