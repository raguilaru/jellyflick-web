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
 * Whether the User is typing into this, in which case the keys are the field's
 * and not the app's: Left and Right move a caret, and Backspace is an edit.
 */
export function isEditable(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  const name = target.tagName;
  return name === 'INPUT' || name === 'TEXTAREA' || name === 'SELECT';
}
