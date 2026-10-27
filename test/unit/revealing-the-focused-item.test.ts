import { describe, expect, it } from 'vitest';
import { scrollToReveal } from '../../src/navigation/reveal';

/**
 * Where a scroller has to be for the focused item to be in view, with a margin
 * kept clear around it. The same maths scrolls a Row sideways to the focused
 * card and the page down to the focused Row, which is why it is one function of
 * numbers rather than two of elements.
 *
 * ADR 0002 rules out `scroll-snap-*`, so this is how a Row scrolls at all:
 * focus moves, and the scroller follows it.
 */

/** A Row of 150px cards 16px apart, in a 600px-wide strip, as `base.css` has it. */
const STRIP = { scroll: 0, length: 600, maximumScroll: 400 } as const;
const MARGIN = 24;

function card(index: number): { start: number; end: number } {
  const start = index * 166;
  return { start, end: start + 150 };
}

describe('revealing the focused item', () => {
  it('leaves a scroller alone when the item is already in view', () => {
    expect(scrollToReveal(STRIP, card(1), MARGIN)).toBeUndefined();
  });

  it('scrolls forward just far enough to clear the margin past the item', () => {
    // The fourth card runs to 648, so 648 + 24 has to be the strip's far edge.
    expect(scrollToReveal(STRIP, card(3), MARGIN)).toBe(72);
  });

  it('scrolls back to the margin before the item', () => {
    expect(scrollToReveal({ ...STRIP, scroll: 400 }, card(2), MARGIN)).toBe(308);
  });

  it('goes to the very start for the first item, rather than before it', () => {
    expect(scrollToReveal({ ...STRIP, scroll: 200 }, card(0), MARGIN)).toBe(0);
  });

  it('never scrolls past the end for the last item', () => {
    const lastCard = { start: 960, end: 1110 };

    expect(scrollToReveal(STRIP, lastCard, MARGIN)).toBe(STRIP.maximumScroll);
  });

  it('counts an item under the margin as needing to be revealed', () => {
    // Fully in view, but only 8px clear of the near edge.
    const barelyIn = { start: 108, end: 258 };

    expect(scrollToReveal({ ...STRIP, scroll: 100 }, barelyIn, MARGIN)).toBe(84);
  });

  it('asks only for the start of an item too long to fit', () => {
    const longer = { start: 300, end: 1200 };

    // Its start is in view, so there is nothing to do, even though its end is
    // far off the edge: chasing the end would push the start out of sight.
    expect(scrollToReveal(STRIP, longer, MARGIN)).toBeUndefined();
    // And when the start is behind the view, that is what is scrolled to.
    expect(scrollToReveal({ ...STRIP, scroll: 400 }, longer, MARGIN)).toBe(276);
  });
});
