import { useCallback, useEffect, useRef, useState } from 'preact/hooks';

/**
 * Controls that get out of the way (#26).
 *
 * How long the player waits, with nothing at all happening, before it takes its
 * controls off the picture. Long enough to read the times and find the seek
 * bar, short enough that a film is not watched through a bar of chrome.
 */
export const CONTROLS_IDLE_MS = 4000;

/**
 * Every kind of input that counts as "the User is still there" — except keys,
 * which the player answers itself and reveals the controls for there.
 *
 * Keys cannot be one of these. The player has to know whether its controls
 * were up **before** the press, because that is what decides whether an arrow
 * key is "show me the controls" or a move between them, and a listener here
 * that revealed them first would have already answered that question wrongly.
 * One owner per kind of input, and keys belong to the player.
 */
const INPUT_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'touchstart', 'focusin'] as const;

export type IdleControlsOptions = {
  /** Whether the player is on the screen at all. Nothing runs when it is not. */
  active: boolean;
  /**
   * Keeps the controls up however long nothing happens: a paused player, or one
   * showing an error. Controls that hide themselves over a still frame leave a
   * User with nothing to press and no way to know there is anything to press.
   */
  keepVisible: boolean;
};

/**
 * Whether the controls are up, and how anything says the User is still there.
 *
 * `reveal` is here as well as the listeners because the player has presses of
 * its own to answer — a media key, a seek — and the controls should come back
 * for those the same way they come back for a mouse moving.
 */
export function useIdleControls(options: IdleControlsOptions): {
  visible: boolean;
  reveal: () => void;
} {
  const { active, keepVisible } = options;
  const [visible, setVisible] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  // Read inside the timer rather than closed over, so a player that is paused
  // while the timer is already running does not hide its controls anyway.
  const held = useRef(keepVisible);
  held.current = keepVisible;

  const clear = useCallback(() => {
    if (timer.current === undefined) return;
    window.clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const reveal = useCallback(() => {
    setVisible(true);
    clear();
    if (held.current) return;
    timer.current = window.setTimeout(() => {
      timer.current = undefined;
      if (!held.current) setVisible(false);
    }, CONTROLS_IDLE_MS);
  }, [clear]);

  // The controls start up — the User has just pressed Play and is looking at
  // the screen — and the wait starts with them.
  useEffect(() => {
    if (!active) {
      clear();
      return;
    }
    reveal();
    return clear;
  }, [active, keepVisible, reveal, clear]);

  useEffect(() => {
    if (!active) return;
    const onInput = (): void => {
      reveal();
    };
    for (const name of INPUT_EVENTS) window.addEventListener(name, onInput);
    return () => {
      for (const name of INPUT_EVENTS) window.removeEventListener(name, onInput);
    };
  }, [active, reveal]);

  return { visible, reveal };
}
