import { describe, expect, it } from 'vitest';
import { hoverCardsAvailable } from '../../src/home/hover-card';

/**
 * The enlarged hover card (#21, stories 52 and 53).
 *
 * happy-dom gives every element a zero-sized rectangle, so nothing here can be
 * about the enlargement itself: that it grows, that it stays on the screen and
 * that it fits at 375px are `test/e2e/desktop-hover-cards.spec.ts`. What is
 * here is every rule that is a rule rather than a measurement.
 */

describe('which devices get an enlarged hover card', () => {
  it('is a computer with a pointer that can hover', () => {
    expect(hoverCardsAvailable('computer', true)).toBe(true);
  });

  it('is not a device whose pointer cannot hover, which is every touch screen', () => {
    expect(hoverCardsAvailable('handheld', false)).toBe(false);
  });

  it('is not a TV, however much its pointer says it can hover', () => {
    // An LG magic remote is a pointer the browser calls fine and hovering, so
    // the media query alone would put an enlarged card on a screen across a
    // room, where a press of Right is how a User gets to the next card.
    expect(hoverCardsAvailable('tv', true)).toBe(false);
  });

  it('is not a handheld that claims a hovering pointer either', () => {
    // A tablet with a trackpad case is still a device the title page serves,
    // and `deviceForm` is the fact the app trusts over the query.
    expect(hoverCardsAvailable('handheld', true)).toBe(false);
  });
});
