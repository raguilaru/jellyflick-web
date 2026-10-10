import { useCallback, useEffect, useRef } from 'preact/hooks';
import { useLocation } from 'preact-iso/router';
import type { DeviceLayer } from '../device/types';
import { HOME_PATH } from './sections';

/**
 * Marks the history entry the app was opened on, so Back can tell "a section I
 * came from" apart from "whatever the browser was showing before Jellyflick".
 */
const ROOT_ENTRY = 'jellyflickRoot';

/**
 * The one Back handler. The browser's back button and the Back key on a remote
 * end in the same place, because the key does nothing of its own: it calls
 * `history.back()`, which is the back button.
 *
 * Only one step is ever its own: Back on the entry the app was opened on has
 * nowhere of ours to go, so it does not leave Jellyflick. From a section that
 * was opened directly — a bookmark, a shared address, a reload — it goes to
 * Home, replacing that entry rather than stacking another one on top of it.
 */
/**
 * What Back has to do before it is allowed to be a navigation at all: the
 * overlays over the screen, innermost last.
 *
 * An overlay is not a history entry — the User Picker deliberately has no
 * address — so `history.back()` would navigate the screen behind it and leave
 * it stranded. Back closes the topmost overlay instead, and only once there
 * are none left does it mean what it meant before. This is the extension point
 * the architecture asks a screen needing its own Back to use, rather than
 * adding a second key listener: the title-page pop-up (#17) and the player
 * (#26) want the same thing.
 */
const overlays: (() => void)[] = [];

/**
 * Claims Back while an overlay is open. The claim is given up when the overlay
 * closes or goes away, so nothing has to remember to release it.
 */
export function useBackClaim(open: boolean, close: () => void): void {
  // The newest value of the callback, so a claim never calls a stale one.
  const current = useRef(close);
  current.current = close;

  useEffect(() => {
    if (!open) return;
    const claim = (): void => {
      current.current();
    };
    overlays.push(claim);
    return () => {
      const at = overlays.lastIndexOf(claim);
      if (at !== -1) overlays.splice(at, 1);
    };
  }, [open]);
}

export function useBackHandler(device: DeviceLayer): void {
  const { path, route } = useLocation();

  // The entry the app was opened on, wherever in the app that was.
  useEffect(() => {
    if (isOnRootEntry()) return;
    window.history.replaceState(
      { [ROOT_ENTRY]: true },
      '',
      window.location.pathname + window.location.search,
    );
  }, []);

  const goBack = useCallback(() => {
    // An overlay over the screen is what Back is about while one is open.
    const overlay = overlays[overlays.length - 1];
    if (overlay !== undefined) {
      overlay();
      return;
    }
    if (!isOnRootEntry()) {
      window.history.back();
      return;
    }
    if (path !== HOME_PATH) route(HOME_PATH, true);
  }, [path, route]);

  // The listener goes on once and stays on. Re-registering it whenever the
  // section changes would leave a frame with no listener at all, and a Back
  // pressed in that frame would be lost.
  const handler = useRef(goBack);
  handler.current = goBack;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if (device.keyFor(event) !== 'Back') return;
      // Backspace is a Back key on a remote and an edit in a text field, and
      // the field has to win: Search is a field a User types into.
      if (isTyping(event.target)) return;
      event.preventDefault();
      handler.current();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [device]);
}

function isOnRootEntry(): boolean {
  const state: unknown = window.history.state;
  return typeof state === 'object' && state !== null && ROOT_ENTRY in state;
}

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const name = target.tagName;
  return name === 'INPUT' || name === 'TEXTAREA' || name === 'SELECT';
}
