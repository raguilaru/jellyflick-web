import { describe, expect, it } from 'vitest';
import type { TitleDetails } from '../../src/catalogue/catalogue';
import { SPOTLIGHT_GOOD_RATING, spotlightPick } from '../../src/home/spotlight';

/**
 * Spotlight: which Title the Billboard features (#16, stories 30, 32 and 33).
 *
 * Every rule here is a pure function of what the Server answered and one draw
 * in [0, 1), which is what makes a pick reproducible: the draw comes from the
 * device layer, so a test fixes it rather than fixing the answer.
 *
 * What a browser is needed for — the Billboard itself — is
 * `billboard-journey.test.tsx` and `test/e2e/the-billboard.spec.ts`.
 */

/** A Title as the Billboard's own query reads it, with only what matters here. */
function title(
  name: string,
  has: { backdrop?: boolean; logo?: boolean; rating?: number; watched?: boolean } = {},
): TitleDetails {
  const itemId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  return {
    title: { kind: 'Movie', itemId, name },
    genres: [],
    cast: [],
    audioLanguages: [],
    subtitleLanguages: [],
    providerIds: {},
    localTrailerCount: 0,
    remoteTrailers: [],
    watched: has.watched === true,
    ...(has.backdrop === false
      ? {}
      : { backdrop: { itemId, imageTag: `${itemId}-backdrop` } }),
    ...(has.logo === true ? { logo: { itemId, imageTag: `${itemId}-logo` } } : {}),
    ...(has.rating === undefined ? {} : { communityRating: has.rating }),
  };
}

/** Which Title each of ten evenly spread draws features. */
function pickedAcrossTheRange(candidates: readonly TitleDetails[]): string[] {
  const draws = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  return draws.map((draw) => spotlightPick(candidates, draw)?.title.name ?? 'nothing');
}

describe('Spotlight picking the Billboard’s Title', () => {
  it('features a Title the User has not finished', () => {
    const candidates = [title('Arrival')];

    expect(spotlightPick(candidates, 0)?.title.name).toBe('Arrival');
  });

  it('never features a Title the Server has no backdrop for', () => {
    // The Billboard is a backdrop with words over it, so a Title without one
    // has nothing to be drawn as — however good it is otherwise.
    const candidates = [title('The Unfinished', { backdrop: false, logo: true, rating: 9 })];

    expect(spotlightPick(candidates, 0)).toBeUndefined();
  });

  it('passes over a Title the User has finished while an unfinished one is there', () => {
    const candidates = [
      title('Heat', { watched: true, logo: true, rating: 8.3 }),
      title('Arrival'),
    ];

    // Every draw, not one: a finished Title is not eligible at all, so no draw
    // can reach it.
    expect(new Set(pickedAcrossTheRange(candidates))).toEqual(new Set(['Arrival']));
  });

  it('falls back to a finished Title when nothing unfinished has a backdrop', () => {
    // A small library, every Title watched: the Billboard still has to show
    // something rather than nothing (story 33).
    const candidates = [
      title('Heat', { watched: true }),
      title('Arrival', { watched: true }),
      title('The Unfinished', { backdrop: false }),
    ];

    expect(new Set(pickedAcrossTheRange(candidates))).toEqual(new Set(['Heat', 'Arrival']));
  });

  it('has nothing to feature when no Title has a backdrop at all', () => {
    const candidates = [
      title('The Unfinished', { backdrop: false }),
      title('Bluey', { backdrop: false }),
    ];

    expect(spotlightPick(candidates, 0)).toBeUndefined();
    expect(spotlightPick([], 0)).toBeUndefined();
  });

  it('weights a Title with a logo and a high rating four times a plain one', () => {
    // Weight 1 against weight 4, so the plain Title takes the first fifth of
    // the range and the recommended one the rest.
    const candidates = [
      title('Heat'),
      title('Arrival', { logo: true, rating: 7.9 }),
    ];

    expect(pickedAcrossTheRange(candidates)).toEqual([
      'Heat',
      'Heat',
      'Arrival',
      'Arrival',
      'Arrival',
      'Arrival',
      'Arrival',
      'Arrival',
      'Arrival',
      'Arrival',
    ]);
  });

  it('weights a logo and a good rating one at a time', () => {
    // Each of the two doubles the weight on its own, so a Title with one of
    // them sits between the plain Title and the one with both: 1, 2, 2, 4 over
    // a total of 9.
    const candidates = [
      title('Heat'),
      title('Bluey', { logo: true }),
      title('Severance', { rating: 8.7 }),
      title('Arrival', { logo: true, rating: 7.9 }),
    ];

    expect(pickedAcrossTheRange(candidates)).toEqual([
      'Heat',
      'Heat',
      'Bluey',
      'Bluey',
      'Severance',
      'Severance',
      'Arrival',
      'Arrival',
      'Arrival',
      'Arrival',
    ]);
  });

  it('counts a rating exactly on the threshold as a good one', () => {
    const onIt = [title('Heat'), title('Arrival', { rating: SPOTLIGHT_GOOD_RATING })];
    // Weight 1 against 2: the plain Title takes the first third.
    expect(pickedAcrossTheRange(onIt)).toEqual([
      'Heat',
      'Heat',
      'Heat',
      'Heat',
      'Arrival',
      'Arrival',
      'Arrival',
      'Arrival',
      'Arrival',
      'Arrival',
    ]);

    // Just under it is not, so both Titles weigh the same and split the range.
    const underIt = [title('Heat'), title('Arrival', { rating: 6.4 })];
    expect(pickedAcrossTheRange(underIt)).toEqual([
      'Heat',
      'Heat',
      'Heat',
      'Heat',
      'Heat',
      'Arrival',
      'Arrival',
      'Arrival',
      'Arrival',
      'Arrival',
    ]);
  });

  it('gives the same answer for the same draw', () => {
    const candidates = [
      title('Heat'),
      title('Arrival', { logo: true, rating: 7.9 }),
      title('Severance', { logo: true, rating: 8.7 }),
    ];

    expect(spotlightPick(candidates, 0.42)?.title.name).toBe(
      spotlightPick(candidates, 0.42)?.title.name,
    );
  });

  it('features something whatever the draw is, including the very top of the range', () => {
    // `random()` answers in [0, 1), but a device layer that rounds up must not
    // be able to make the Billboard empty.
    const candidates = [title('Heat'), title('Arrival', { logo: true, rating: 7.9 })];

    for (const draw of [0, 0.999_999, 1]) {
      expect(spotlightPick(candidates, draw)).toBeDefined();
    }
  });
});
