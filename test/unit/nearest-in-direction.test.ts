import { describe, expect, it } from 'vitest';
import { nearestInDirection, type Box } from '../../src/navigation/nearest';

/**
 * The geometry behind "focus moves to the nearest item in the direction I
 * press" (story 65), on boxes rather than elements: happy-dom gives every
 * element a zero-sized rectangle, so this is the one place the rules can be
 * pinned down. Putting them onto real elements is covered in a browser, by
 * `test/e2e/arrow-key-navigation.spec.ts`.
 *
 * The boxes below are laid out as a screen is: a bar of links across the top,
 * then Rows of 150×225 cards 16px apart, which is what `base.css` describes.
 */

/** A box from its top-left corner and its size, the way a layout is read. */
function box(left: number, top: number, width: number, height: number): Box {
  return { left, top, right: left + width, bottom: top + height };
}

const CARD = { width: 150, height: 225, gap: 16 } as const;

function cardsFrom(left: number, top: number, count: number): Box[] {
  const cards: Box[] = [];
  for (let index = 0; index < count; index += 1) {
    cards.push(box(left + index * (CARD.width + CARD.gap), top, CARD.width, CARD.height));
  }
  return cards;
}

/** The index the direction should pick, named so a failure reads plainly. */
function at(cards: readonly Box[], index: number): Box {
  return cards[index] as Box;
}

describe('the nearest item in a direction', () => {
  it('is the next card along the Row when Right is pressed', () => {
    const cards = cardsFrom(24, 300, 3);

    expect(nearestInDirection(at(cards, 0), cards, 'Right')).toBe(1);
    expect(nearestInDirection(at(cards, 1), cards, 'Right')).toBe(2);
  });

  it('is the previous card when Left is pressed', () => {
    const cards = cardsFrom(24, 300, 3);

    expect(nearestInDirection(at(cards, 2), cards, 'Left')).toBe(1);
  });

  it('is nothing at all at the end of a Row', () => {
    const cards = cardsFrom(24, 300, 3);

    expect(nearestInDirection(at(cards, 2), cards, 'Right')).toBeUndefined();
    expect(nearestInDirection(at(cards, 0), cards, 'Left')).toBeUndefined();
  });

  it('is never the item focus is already on', () => {
    const only = box(24, 300, CARD.width, CARD.height);

    for (const direction of ['Up', 'Down', 'Left', 'Right'] as const) {
      expect(nearestInDirection(only, [only], direction), direction).toBeUndefined();
    }
  });

  it('prefers the card lined up below over one no further down but off to the side', () => {
    const firstRow = cardsFrom(24, 300, 3);
    const secondRow = cardsFrom(24, 600, 3);
    const candidates = [...firstRow, ...secondRow];

    // From the third card of the first Row: the third card of the second Row is
    // directly below it, and the first card of the second Row is exactly as far
    // down but a long way to the left.
    expect(nearestInDirection(at(firstRow, 2), candidates, 'Down')).toBe(5);
  });

  it('stays in the Row when Right is pressed, rather than dropping to a nearer card below', () => {
    const firstRow = cardsFrom(24, 300, 2);
    // A Row close enough underneath that its cards are nearer, as the crow
    // flies, than the next card along this one.
    const secondRow = cardsFrom(24, 530, 2);
    const candidates = [...firstRow, ...secondRow];

    expect(nearestInDirection(at(firstRow, 0), candidates, 'Right')).toBe(1);
  });

  it('reaches the navigation bar above the first Row when Up is pressed', () => {
    const home = box(180, 20, 60, 24);
    const movies = box(260, 20, 70, 24);
    const cards = cardsFrom(24, 300, 3);
    const candidates = [home, movies, ...cards];

    // The second card sits under Movies rather than under Home.
    expect(nearestInDirection(at(cards, 1), candidates, 'Up')).toBe(1);
  });

  it('takes the first of two equally good candidates, so the choice follows the document', () => {
    const from = box(100, 100, 100, 100);
    const earlier = box(100, 300, 100, 100);
    const later = box(100, 300, 100, 100);

    expect(nearestInDirection(from, [earlier, later], 'Down')).toBe(0);
  });
});
