import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/preact';
import type { TitleDetails } from '../../src/catalogue/catalogue';
import { en } from '../../src/i18n/en';
import { ExtraRatings, ExtraRatingBadges } from '../../src/ratings/extra-ratings-badges';
import type { ExtraRating } from '../../src/ratings/extra-ratings';

/**
 * What the extra ratings look like once they have been read (#20, story 82).
 *
 * The seam here is the badges themselves, given ratings: what they say, and
 * that a Title with none of them adds nothing to the page. Reading them is
 * `extra-ratings.test.ts`, against the container's real route with MDBList
 * faked over HTTP — happy-dom's `fetch` applies the Same Origin Policy and the
 * container sends no CORS headers, so the two cannot be the same test.
 *
 * `ExtraRatingBadges` is also the compact version #21's enlarged hover card
 * takes, which is why it is a component of its own and not part of the title
 * page.
 */

const ARRIVAL: readonly ExtraRating[] = [
  { source: 'audience', value: 82 },
  { source: 'metacritic', value: 81 },
  { source: 'letterboxd', value: 3.9 },
  { source: 'trakt', value: 78 },
];

/** The names the badges are read out by, which is what a test points at. */
function badgeNames(): readonly string[] {
  return screen.getAllByRole('listitem').map((item) => item.textContent ?? '');
}

describe('the extra ratings a host’s MDBList key buys', () => {
  it('says each source and its score on that source’s own scale', () => {
    render(<ExtraRatingBadges ratings={ARRIVAL} />);

    expect(badgeNames()).toEqual([
      'Audience 82%',
      'Metacritic 81%',
      'Letterboxd 3.9/5',
      'Trakt 78%',
    ]);
  });

  it('is headed, so the numbers are not four bare scores on a page', () => {
    render(<ExtraRatingBadges ratings={ARRIVAL} />);

    expect(screen.getByRole('list', { name: en['ratings.heading'] })).toBeTruthy();
  });

  it('shows only the sources there are, and never a zero or a blank', () => {
    // Story 81: a Title MDBList knows two sources for gets two badges.
    render(<ExtraRatingBadges ratings={[{ source: 'metacritic', value: 81 }]} />);

    expect(badgeNames()).toEqual(['Metacritic 81%']);
  });

  it('adds nothing at all to a page with no extra ratings', () => {
    const { container } = render(<ExtraRatingBadges ratings={[]} />);

    // Not an empty list and not a heading over nothing: a Title the host's key
    // buys nothing for looks like a Title on a host with no key at all.
    expect(container.innerHTML).toBe('');
  });

  it('is the same words in a compact form, for a card to carry', () => {
    // #21's enlarged hover card wants the ratings without the title page's
    // heading. The source is still named: four bare percentages on a card say
    // nothing about what they are.
    render(<ExtraRatingBadges ratings={ARRIVAL} compact />);

    expect(screen.queryByText(en['ratings.heading'])).toBeNull();
    expect(badgeNames()).toEqual([
      'Audience 82%',
      'Metacritic 81%',
      'Letterboxd 3.9/5',
      'Trakt 78%',
    ]);
  });

  it('rounds a score that arrives with more precision than it is read with', () => {
    render(<ExtraRatingBadges ratings={[{ source: 'audience', value: 82.4 }]} />);

    expect(badgeNames()).toEqual(['Audience 82%']);
  });
});

describe('a Title there is nothing to ask MDBList about', () => {
  it('asks nothing and shows nothing', async () => {
    // No provider id, so there is no lookup to make: `ExtraRatings` reads
    // nothing and draws nothing, whatever the host configured.
    const unfinished: TitleDetails = {
      title: { kind: 'Movie', itemId: 'movie-unfinished', name: 'The Unfinished' },
      genres: [],
      cast: [],
      audioLanguages: [],
      subtitleLanguages: [],
      providerIds: {},
      watched: false,
    };

    const { container } = render(<ExtraRatings details={unfinished} />);

    expect(container.innerHTML).toBe('');
    // Still nothing a tick later: there was no request to come back.
    await Promise.resolve();
    expect(container.innerHTML).toBe('');
  });
});
