/**
 * Which way the User is driving the app, so the focus highlight is there for a
 * keyboard or a remote and not for a mouse click (stories 54 and 65).
 *
 * `:focus-visible` is the browser's own answer to this and is Chrome 86, well
 * above the Chromium 68 floor, so the app keeps the answer itself: the latest
 * kind of input is written on the root element and `base.css` takes the ring
 * away for a pointer. Nothing written means a keyboard, which is what a TV
 * always is — the highlight is there from the first press rather than after it.
 */
import { useEffect } from 'preact/hooks';

/** Written on the root element. `base.css` reads it, and so can a test. */
export const INPUT_MODALITY_ATTRIBUTE = 'data-input';

export type InputModality = 'keyboard' | 'pointer';

export function useInputModality(): void {
  useEffect(() => {
    const note = (modality: InputModality) => (): void => {
      document.documentElement.setAttribute(INPUT_MODALITY_ATTRIBUTE, modality);
    };
    const onKeyDown = note('keyboard');
    const onPointerDown = note('pointer');

    window.addEventListener('keydown', onKeyDown, true);
    // `pointerdown` is Chrome 55 and covers a mouse, a pen and a finger alike.
    // It fires before focus moves, so the ring is already settled by the time
    // the click lands.
    window.addEventListener('pointerdown', onPointerDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('pointerdown', onPointerDown, true);
    };
  }, []);
}
