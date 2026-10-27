import { useEffect, useState } from 'preact/hooks';
import type { TitleDetails } from '../catalogue/catalogue';
import { useTranslate, type Translate } from '../i18n/index';
import {
  readExtraRatings,
  SOURCE_SCALES,
  type ExtraRating,
  type ExtraRatingSource,
} from './extra-ratings';

/**
 * The extra ratings on a screen (#20, story 82).
 *
 * Two components, because two screens want different halves of this:
 *
 * - {@link ExtraRatings} reads a Title's ratings and draws them. The title page
 *   uses it, and so does **#21's enlarged hover card**: it takes the Title's
 *   `TitleDetails` and a `compact` flag and needs nothing else, and the read
 *   happens when it mounts, which on a card means on hover rather than for
 *   every card in a Row — `docs/research/ratings-mdblist.md` is explicit that
 *   eager reads would burn the free tier's 1,000 requests a day.
 * - {@link ExtraRatingBadges} is the drawing alone, given ratings. It is what
 *   makes the look testable without a container to read from, and what a screen
 *   that already holds its ratings would use.
 *
 * Nothing is drawn when there are no extra ratings — not an empty list and not
 * a heading over nothing. Story 81 wants a missing rating left out, and a
 * household whose host set no MDBList key should see a page that looks finished
 * rather than one with a gap in it.
 */

export type ExtraRatingsProps = {
  /** The Title to read ratings for. Its `providerIds` are the join key. */
  details: TitleDetails;
  /** The version a card carries: the same words, tighter and unheaded. */
  compact?: boolean;
};

export function ExtraRatings({ details, compact }: ExtraRatingsProps) {
  const ratings = useExtraRatings(details);
  return <ExtraRatingBadges ratings={ratings} {...(compact === true ? { compact } : {})} />;
}

/**
 * One Title's extra ratings, read once per Title per visit (the cache is in
 * `extra-ratings.ts`). An empty list is every way of having none — no provider
 * id, no key on the host, a Title MDBList does not know, a failure — and none
 * of them is a state a User is told about: the Server's own ratings are still
 * on the page.
 */
export function useExtraRatings(details: TitleDetails): readonly ExtraRating[] {
  const [ratings, setRatings] = useState<readonly ExtraRating[]>(EMPTY);

  useEffect(() => {
    let abandoned = false;
    // Cleared first, so a card moving to another Title never shows the last
    // one's scores while the new ones are being read.
    setRatings(EMPTY);
    void readExtraRatings(details).then((read) => {
      if (abandoned) return;
      setRatings(read);
    });
    return () => {
      abandoned = true;
    };
    // The Title and its ids are what a read depends on, not the object: the
    // page rebuilds `details` on every render.
  }, [details.title.itemId, details.providerIds.imdb, details.providerIds.tmdb]);

  return ratings;
}

const EMPTY: readonly ExtraRating[] = [];

export type ExtraRatingBadgesProps = {
  ratings: readonly ExtraRating[];
  compact?: boolean;
};

export function ExtraRatingBadges({ ratings, compact }: ExtraRatingBadgesProps) {
  const t = useTranslate();
  if (ratings.length === 0) return null;

  return (
    <ul
      class={compact === true ? 'ratings ratings--compact' : 'ratings'}
      aria-label={t('ratings.heading')}
    >
      {ratings.map((rating) => (
        <li class="ratings__rating" key={rating.source}>
          <span class="ratings__source">{t(SOURCE_LABELS[rating.source])}</span>{' '}
          <span class="ratings__score">{scoreOf(rating, t)}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * Each source's name, as its own message: Metacritic, Letterboxd and Trakt are
 * products and keep their names in every language, and the Rotten Tomatoes
 * audience score is "the audience", which does not.
 */
const SOURCE_LABELS: Readonly<Record<ExtraRatingSource, 'ratings.audience' | 'ratings.metacritic' | 'ratings.letterboxd' | 'ratings.trakt'>> =
  {
    audience: 'ratings.audience',
    metacritic: 'ratings.metacritic',
    letterboxd: 'ratings.letterboxd',
    trakt: 'ratings.trakt',
  };

/**
 * A score on its own source's scale: a percentage for the three that publish
 * one, and stars for Letterboxd, which is out of five. Reading 3.9 as "3.9%"
 * would be wrong by a factor of twenty.
 */
function scoreOf(rating: ExtraRating, t: Translate): string {
  return SOURCE_SCALES[rating.source].outOf === 100
    ? t('ratings.percent', { score: rating.value })
    : t('ratings.outOfFive', { score: rating.value });
}
