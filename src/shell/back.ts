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
