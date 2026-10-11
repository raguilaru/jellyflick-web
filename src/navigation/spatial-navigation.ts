/**
 * Arrow keys, and Enter: the one place the app moves focus itself.
 *
 * Stories 64 and 65 — every screen usable with only arrows, Enter and Back,
 * focus going to the nearest item in the direction pressed, and coming back
 * where it was left when it returns to a Row. The keys arrive as the device
 * layer's logical keys, so the webOS port maps a remote once in `src/device/`
 * and nothing here changes.
 *
 * The parts: `nearest.ts` is the geometry, `focusable.ts` says what counts and
 * which strips remember their place, `reveal.ts` works out how far a scroller
 * has to move. This module is the wiring between them and the document, and it
 * is deliberately thin, because none of it can be tested outside a browser:
 * happy-dom gives every element a zero-sized rectangle.
 *
 * Back is not here. It is one handler of its own, `src/shell/back.ts`, because
 * it is the browser's back button as much as it is a key.
 */
import { useEffect, useRef } from 'preact/hooks';
import type { DeviceKey, DeviceLayer } from '../device/types';
import { FOCUSABLE_SELECTOR, groupOf, isEditable, tabStopIn } from './focusable';
import { nearestInDirection, type Box, type Direction } from './nearest';
import { scrollToReveal } from './reveal';

/**
 * How much of the page is kept clear above and below the focused item. Enough
 * to clear the sticky top bar and the phone's fixed bottom bar, so focus is
 * never under either of them.
 */
const PAGE_MARGIN = 80;

const DIRECTIONS: readonly DeviceKey[] = ['Up', 'Down', 'Left', 'Right'];

export function useSpatialNavigation(device: DeviceLayer): void {
  // The listener goes on once and stays on, for the same reason the Back
  // handler's does: a frame with no listener is a keypress lost.
  const latest = useRef(device);
  latest.current = device;

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const key = latest.current.keyFor(event);

      if (key === 'Enter') {
        // A field owns Enter as it owns the arrow keys. Search's field takes
        // Enter to hand focus on to its results (#24), and `pressFocusedItem`
        // reads `document.activeElement` — which that handler has already
        // moved — so without this one press would both leave the field and
        // press the card it landed on, opening a title page nobody asked for.
        if (isEditable(event.target)) return;
        if (pressFocusedItem()) event.preventDefault();
        return;
      }
      if (DIRECTIONS.indexOf(key) === -1) return;
      // A field the User is typing in owns the arrow keys: they move a caret.
      if (isEditable(event.target)) return;
      if (moveFocus(key as Direction)) event.preventDefault();
    };

    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}

/**
 * Presses what focus is on, where that is something the browser will not press
 * itself. A card is a focus stop rather than a button — pressing one opens its
 * title page, which is its own ticket — so Enter has to click it; a button, a
 * link or a field is the browser's own, and clicking it here would press it
 * twice.
 */
function pressFocusedItem(): boolean {
  const focused = document.activeElement;
  if (!(focused instanceof HTMLElement)) return false;
  if (!focused.hasAttribute('tabindex')) return false;
  const name = focused.tagName;
  if (name === 'A' || name === 'BUTTON' || isEditable(focused)) return false;
  focused.click();
  return true;
}

/**
 * Moves focus one step in the direction pressed, and answers whether it moved.
 *
 * Arriving in a strip that remembers its place — a Row — lands on what it
 * remembers rather than on whatever geometry picked, which is how a Row is
 * returned to where it was left.
 */
function moveFocus(direction: Direction): boolean {
  const from = focusedItem();
  const candidates = focusableItems().filter((item) => item !== from);
  if (candidates.length === 0) return false;

  const fromBox = from === undefined ? viewportEdge(direction) : boxOf(from);
  const chosen = chooseCandidate(from, fromBox, candidates, direction);
  if (chosen === undefined) return false;

  const target = enteringGroup(from, chosen) ?? chosen;
  target.focus();
  revealOnPage(target);
  return true;
}

/**
 * The candidate to move to.
 *
 * **A Row is a line**, so Left and Right walk the line and never leave it: at
 * either end of a Row there is simply nowhere further to go, and the way out
 * of a Row is Up or Down. Without this, anything focusable to the right of a
 * Row's last card — the User picture at the end of the top bar (#8), a button
 * on an enlarged card (#21) — is the only candidate rightwards and wins by
 * default, however far above the Row it sits. Pressing Right at the end of a
 * Row would then jump to the top corner of the screen.
 *
 * Only strips that mark themselves a focus group are lines in this sense. A
 * grid that wraps down the page — the My List page — is not one, and Right
 * there goes on to the next Title as the geometry says.
 *
 * Then: items in the same flow as the one focus is on are tried first, so the
 * Row below is reached before the bottom bar, which is fixed to the bottom of
 * the screen and would otherwise always be the nearest thing downwards. Fixed
 * chrome is reached only once the flow has run out — and from inside an
 * overlay, which is itself fixed, the overlay is the flow.
 */
function chooseCandidate(
  from: HTMLElement | undefined,
  fromBox: Box,
  candidates: readonly HTMLElement[],
  direction: Direction,
): HTMLElement | undefined {
  const horizontal = direction === 'Left' || direction === 'Right';
  const line = horizontal && from !== undefined ? groupOf(from) : undefined;
  if (line !== undefined) {
    const alongTheLine = candidates.filter((item) => groupOf(item) === line);
    const index = nearestInDirection(
      fromBox,
      alongTheLine.map((item) => boxOf(item)),
      direction,
    );
    return index === undefined ? undefined : alongTheLine[index];
  }

  const fixedHere = from !== undefined && isFixed(from);
  const sameFlow = candidates.filter((item) => isFixed(item) === fixedHere);
  const otherFlow = candidates.filter((item) => isFixed(item) !== fixedHere);

  for (const group of [sameFlow, otherFlow]) {
    const index = nearestInDirection(
      fromBox,
      group.map((item) => boxOf(item)),
      direction,
    );
    if (index !== undefined) return group[index];
  }
  return undefined;
}

/**
 * The tab stop of the group focus is arriving in, or nothing when it is not
 * arriving anywhere new: moving inside a Row is plain geometry, or Left and
 * Right could never leave the card the Row remembers.
 */
function enteringGroup(
  from: HTMLElement | undefined,
  chosen: HTMLElement,
): HTMLElement | undefined {
  const group = groupOf(chosen);
  if (group === undefined) return undefined;
  if (from !== undefined && groupOf(from) === group) return undefined;
  return tabStopIn(group);
}

/**
 * What focus is on, or nothing when it is on the page at large: a fresh screen,
 * or one whose focused item has just been taken away. The body counts as
 * nothing, so the first arrow press enters the screen from its edge rather than
 * stepping out from the middle of the whole document.
 */
function focusedItem(): HTMLElement | undefined {
  const active = document.activeElement;
  if (!(active instanceof HTMLElement)) return undefined;
  if (active === document.body || active === document.documentElement) return undefined;
  return active;
}

/** Everything the arrows can reach: focusable, and actually drawn. */
function focusableItems(): HTMLElement[] {
  const items: HTMLElement[] = [];
  document.querySelectorAll(FOCUSABLE_SELECTOR).forEach((element) => {
    if (!(element instanceof HTMLElement)) return;
    const box = element.getBoundingClientRect();
    // A zero-sized box is something hidden, or a screen reader's own hook.
    if (box.width === 0 || box.height === 0) return;
    items.push(element);
  });
  return items;
}

function boxOf(element: HTMLElement): Box {
  const { left, top, right, bottom } = element.getBoundingClientRect();
  return { left, top, right, bottom };
}

/**
 * Where focus comes from when nothing has it: the edge the direction is coming
 * from, so the first press lands on the first item that way rather than on
 * whatever happens to be at the top left.
 */
function viewportEdge(direction: Direction): Box {
  const width = window.innerWidth;
  const height = window.innerHeight;
  switch (direction) {
    case 'Down':
      return { left: 0, top: -1, right: width, bottom: -1 };
    case 'Up':
      return { left: 0, top: height + 1, right: width, bottom: height + 1 };
    case 'Right':
      return { left: -1, top: 0, right: -1, bottom: height };
    case 'Left':
      return { left: width + 1, top: 0, right: width + 1, bottom: height };
  }
}

/** Whether this element, or anything it sits inside, is fixed to the screen. */
function isFixed(element: Element | null): boolean {
  let current: Element | null = element;
  while (current !== null && current !== document.body) {
    if (window.getComputedStyle(current).position === 'fixed') return true;
    current = current.parentElement;
  }
  return false;
}

/**
 * Scrolls the page down or up to the focused item. Sideways is the Row's own
 * job, because only the Row knows which of its cards took focus; this is the
 * other axis, and it uses the same arithmetic.
 */
function revealOnPage(element: HTMLElement): void {
  const box = element.getBoundingClientRect();
  const scroll = window.pageYOffset;
  const top = scrollToReveal(
    {
      scroll,
      length: window.innerHeight,
      maximumScroll: Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
    },
    { start: box.top + scroll, end: box.bottom + scroll },
    PAGE_MARGIN,
  );
  if (top === undefined) return;
  try {
    window.scrollTo({ top, behavior: 'smooth' });
  } catch {
    window.scrollTo(window.pageXOffset, top);
  }
}
