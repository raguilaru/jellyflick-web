import type { TitleDetails } from '../catalogue/catalogue';

/**
 * Spotlight: which Title the Billboard features (#16, stories 30, 32 and 33).
 *
 * It is the default Billboard Source, and the only one built today — the others
 * are #22, which adds them beside this one through the seam in `billboard.ts`.
 *
 * Every rule is a pure function of what the Server answered plus **one draw**,
 * which the caller takes from the device layer. That is what makes a pick
 * reproducible: nothing here reads `Math.random()`, so a test fixes the draw
 * rather than fixing the answer, and the webOS port inherits the same rule.
 *
 * The shape of the rule is a *weighted* pick rather than a filter, because
 * story 32 asks for a preference and not a restriction: a household whose
 * highly rated Titles are all watched must still see its other Titles featured.
 * So:
 *
 * - **Eligible** is a Title the User has not finished that the Server has a
 *   backdrop for. The backdrop is not a preference: the Billboard *is* a
 *   backdrop with words over it, so a Title without one cannot be drawn.
 * - **Weighted** towards a logo and a community rating of 6.5 or higher. Each
 *   doubles a candidate's weight on its own, so the four combinations weigh
 *   1, 2, 2 and 4 — a Title with both is four times as likely as a plain one,
 *   and a Title with one of them sits between. Independent factors rather than
 *   one combined bonus, so a library whose good Titles have no logos is still
 *   steered by its ratings.
 * - **The fallback** is any Title with a backdrop, finished or not, for the
 *   User whose small library holds nothing unfinished (story 33). An empty
 *   Billboard is the one answer worth avoiding.
 */

/**
 * The community rating at or above which Spotlight prefers a Title — the
 * threshold story 32 names. Jellyfin's community score is out of 10.
 */
export const SPOTLIGHT_GOOD_RATING = 6.5;

/** What a plain eligible Title weighs, before the two preferences. */
const BASE_WEIGHT = 1;

/** What a logo, and separately a good rating, multiply a Title's weight by. */
const PREFERRED_MULTIPLIER = 2;

/**
 * The Title to feature, or `undefined` when the Server has nothing that can be
 * drawn as a Billboard at all.
 *
 * `draw` is a number in [0, 1) — `device.random()`. A draw of exactly 1, which
 * `random()` never returns but a rounding device layer might, features the last
 * candidate rather than nothing.
 */
export function spotlightPick(
  candidates: readonly TitleDetails[],
  draw: number,
): TitleDetails | undefined {
  const drawable = candidates.filter(hasABackdrop);
  // Unfinished first, and only then anything at all: the fallback is a second
  // pool rather than a weaker weight, because "I have not seen this" is the
  // promise the Billboard makes and not merely a preference.
  const unfinished = drawable.filter((candidate) => !candidate.watched);
  const pool = unfinished.length > 0 ? unfinished : drawable;
  if (pool.length === 0) return undefined;

  return weightedPick(pool, draw);
}

/**
 * One of the pool, with the weights above. The draw is scaled onto the total
 * weight and the pool walked until it is used up, so a candidate's share of
 * the range is exactly its share of the weight.
 */
function weightedPick(
  pool: readonly TitleDetails[],
  draw: number,
): TitleDetails {
  const weights = pool.map(weightOf);
  const total = weights.reduce((sum, weight) => sum + weight, 0);

  // Clamped, so a draw outside [0, 1) still features something.
  let remaining = Math.max(0, Math.min(1, draw)) * total;
  for (let index = 0; index < pool.length; index += 1) {
    remaining -= weights[index] as number;
    // Strictly less than zero, so each candidate owns the bottom of its own
    // band and the first candidate owns a draw of zero.
    if (remaining < 0) return pool[index] as TitleDetails;
  }
  // Only a draw of exactly 1 reaches here, and the last candidate is the one
  // whose band it sits at the top of.
  return pool[pool.length - 1] as TitleDetails;
}

/**
 * How strongly Spotlight prefers one eligible Title. See the note above: the
 * logo and the rating are independent doublings.
 */
function weightOf(candidate: TitleDetails): number {
  let weight = BASE_WEIGHT;
  if (candidate.logo !== undefined) weight *= PREFERRED_MULTIPLIER;
  if (
    candidate.communityRating !== undefined &&
    candidate.communityRating >= SPOTLIGHT_GOOD_RATING
  ) {
    weight *= PREFERRED_MULTIPLIER;
  }
  return weight;
}

/**
 * Whether the Billboard has a picture for this Title. `titleDetailsFrom` leaves
 * the backdrop out when the Server sent none, so this is the one check — an
 * inherited `ParentBackdropImageTags` belongs to an Episode, and the Billboard
 * only ever features a Title.
 */
function hasABackdrop(candidate: TitleDetails): boolean {
  return candidate.backdrop !== undefined;
}
