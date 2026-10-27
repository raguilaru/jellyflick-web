/**
 * Where a scroller has to be for the focused item to be in view.
 *
 * ADR 0002 puts `scroll-snap-*` at Chrome 69, one version above the floor, and
 * it ships raw — so a Row does not snap, it follows focus: focus moves to a
 * card and the strip scrolls to show it. This is the arithmetic for that, on
 * one axis, so the same function scrolls a Row sideways to its focused card and
 * the page down to the focused Row.
 */

/** A scroller: where it is, how much it shows, and how far it can go. */
export type Scroller = {
  readonly scroll: number;
  /** The visible length along this axis. */
  readonly length: number;
  readonly maximumScroll: number;
};

/** An item's extent along the same axis, in the scroller's own coordinates. */
export type Span = {
  readonly start: number;
  readonly end: number;
};

/**
 * The offset to scroll to, or `undefined` when the item is already in view with
 * its margin clear — so a caller never starts a scroll that changes nothing.
 *
 * The margin is kept clear on both sides, which is what keeps a focused card
 * from sitting against the edge of its Row, and a focused Row from hiding under
 * the sticky navigation bar.
 *
 * An item too long to fit is asked for by its start alone, so a User sees where
 * it begins: chasing its end would push its start out of sight.
 */
export function scrollToReveal(
  scroller: Scroller,
  item: Span,
  margin: number,
): number | undefined {
  const wanted = scrollFor(scroller, item, margin);
  if (wanted === undefined) return undefined;
  const clamped = Math.max(0, Math.min(wanted, scroller.maximumScroll));
  return clamped === scroller.scroll ? undefined : clamped;
}

function scrollFor(scroller: Scroller, item: Span, margin: number): number | undefined {
  const wanted = withinReach(scroller, item, margin);
  const before = wanted.start - margin;
  const after = wanted.end + margin - scroller.length;
  if (before < scroller.scroll) return before;
  if (after > scroller.scroll) return after;
  return undefined;
}

/**
 * The part of the item worth asking for: all of it, or just its start when it
 * is longer than the scroller can show with its margins clear.
 */
function withinReach(scroller: Scroller, item: Span, margin: number): Span {
  const showable = scroller.length - margin * 2;
  if (item.end - item.start <= showable) return item;
  return { start: item.start, end: item.start };
}
