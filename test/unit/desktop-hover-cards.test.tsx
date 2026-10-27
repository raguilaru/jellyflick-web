import { describe, expect, it } from 'vitest';
import type { TitleDetails } from '../../src/catalogue/catalogue';
import { en } from '../../src/i18n/en';
import { createTranslate } from '../../src/i18n/index';
import { hoverCardFactsOf, hoverCardsAvailable } from '../../src/home/hover-card';

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

const t = createTranslate(en);

/** Arrival, with everything an enlarged card can say about a Title. */
const ARRIVAL: TitleDetails = {
  title: { kind: 'Movie', itemId: 'movie-arrival', name: 'Arrival' },
  year: 2016,
  ageRating: 'PG-13',
  runtimeMinutes: 116,
  genres: ['Drama', 'Science Fiction'],
  criticRating: 94,
  communityRating: 7.9,
  cast: [],
  audioLanguages: [],
  subtitleLanguages: [],
  providerIds: {},
  localTrailerCount: 0,
  remoteTrailers: [],
  watched: false,
};

describe('what an enlarged card says about a Title', () => {
  it('is the age rating, the length and the genres, in that order', () => {
    expect(hoverCardFactsOf(ARRIVAL, t)).toEqual(['PG-13', '1h 56m', 'Drama, Science Fiction']);
  });

  it('leaves out the year and both of the Server’s own ratings', () => {
    // Deliberately narrower than the title page's own facts line. Story 52
    // asks for the age rating, the length and the genres; the two scores on a
    // card are the *extra* ratings, which `ExtraRatings` draws compactly under
    // this line, and four more numbers beside them would be a wall of them.
    const facts = hoverCardFactsOf(ARRIVAL, t);

    expect(facts).not.toContain('2016');
    expect(facts.join(' ')).not.toContain('critics');
    expect(facts.join(' ')).not.toContain('community');
  });

  it('leaves out every fact the Server did not send, rather than drawing it empty', () => {
    // Story 81 past the ratings as well as in them, which is the title page's
    // rule too: a label with nothing after it says less than no label.
    const unfinished: TitleDetails = {
      title: { kind: 'Movie', itemId: 'movie-unfinished', name: 'The Unfinished' },
      genres: [],
      cast: [],
      audioLanguages: [],
      subtitleLanguages: [],
      providerIds: {},
      localTrailerCount: 0,
      remoteTrailers: [],
      watched: false,
    };

    expect(hoverCardFactsOf(unfinished, t)).toEqual([]);
  });

  it('says a Series’ genres without a length, because a Series has none', () => {
    const bluey: TitleDetails = {
      title: { kind: 'Series', itemId: 'series-bluey', name: 'Bluey' },
      ageRating: 'TV-Y',
      genres: ['Animation'],
      cast: [],
      audioLanguages: [],
      subtitleLanguages: [],
      providerIds: {},
      localTrailerCount: 0,
      remoteTrailers: [],
      watched: false,
    };

    expect(hoverCardFactsOf(bluey, t)).toEqual(['TV-Y', 'Animation']);
  });
});
