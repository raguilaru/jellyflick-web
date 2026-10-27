/**
 * What the arrow keys can move focus to, and the groups they move between.
 *
 * A **focus group** is a strip with a memory: a Row. Arriving from outside, the
 * arrows land on the group's own tab stop — the card focus was last on — rather
 * than on whichever card happens to be nearest, which is the "come back where I
 * left off" half of story 65. Inside a group, geometry decides as usual.
 *
 * The group's memory is its tab stop, so there is no store to keep: the Row
 * already marks the card it remembers with `tabindex="0"`, because that is what
 * makes Tab step from Row to Row. One fact, read two ways.
 */

/** Marks a strip whose members are entered at its tab stop. */
export const FOCUS_GROUP_ATTRIBUTE = 'data-focus-group';

/**
 * Everything the arrow keys consider. `[tabindex]` is included whatever its
 * value: a Row's cards are all focus stops for the arrows, and all but one of
 * them hold `tabindex="-1"` to keep Tab out.
 */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]',
].join(', ');

/** The group an element belongs to, or `undefined` when it is in none. */
export function groupOf(element: Element): Element | undefined {
  return element.closest(`[${FOCUS_GROUP_ATTRIBUTE}]`) ?? undefined;
}

/**
 * The member of a group that focus should land on: the one it remembers. A
 * group whose tab stop has gone — a Row still being filled — gives nothing, and
 * the caller falls back to what geometry chose.
 */
export function tabStopIn(group: Element): HTMLElement | undefined {
  const stop = group.querySelector('[tabindex="0"]');
  return stop instanceof HTMLElement ? stop : undefined;
}

/**
 * The fixed thing this element is inside, which is the flow it belongs to, or
 * nothing when it is in the page's own flow. Two elements are in the same flow
 * when this answers the same element for both.
 *
 * **The innermost fixed ancestor, not the outermost.** Overlays nest: the
 * player is drawn inside whatever screen was showing, and the title page's
 * pop-up shape is itself `position: fixed` (`.title--popup`, which is the
 * mechanism that makes *it* a flow). Reading the outermost answered
 * `.title--popup` for the player's own controls as well as for the cards on the
 * page behind it, so the two sat in one flow and the overlay rule in
 * `spatial-navigation.ts` — the one that says an overlay has no way out of it —
 * never applied on the one screen a Title is played from. Right from the subtitle menu's Off button
 * focused a card behind the picture; it was the nearest thing rightwards, and
 * on CI's slightly wider boxes it beat the choice beside it.
 *
 * Innermost is the answer every case that rule was written for wants. A
 * menu inside the player (`track-picker.tsx`) becomes a flow in its own right,
 * which is what a modal menu covering those controls should be. The phone's
 * bottom bar is still a flow of its own rather than part of the player, which
 * is what #26 needed. And a screen that is fixed is still the flow for the
 * things *in* that screen, which is what #17 needed.
 */
export function fixedRootOf(element: Element | null): Element | undefined {
  let current: Element | null = element;
  while (current !== null && current !== document.body) {
    if (window.getComputedStyle(current).position === 'fixed') return current;
    current = current.parentElement;
  }
  return undefined;
}

/**
 * Whether the User is typing into this, in which case the keys are the field's
 * and not the app's: Left and Right move a caret, and Backspace is an edit.
 */
export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const name = target.tagName;
  return name === 'INPUT' || name === 'TEXTAREA' || name === 'SELECT';
}
