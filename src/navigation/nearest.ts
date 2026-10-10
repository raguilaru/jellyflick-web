/**
 * "The nearest item in the direction I press" (story 65), as geometry.
 *
 * Boxes rather than elements, so the rules are one pure function that can be
 * read and tested on a layout written out by hand. Which boxes are candidates,
 * and what happens to the one that wins, belongs to `spatial-navigation.ts`.
 */

export type Direction = 'Up' | 'Down' | 'Left' | 'Right';

/** The part of a `DOMRect` this needs. Viewport coordinates, as rects are. */
export type Box = {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
};

/**
 * How much a step off the pressed direction's axis costs, against a pixel along
 * it. High, because a Row is a line: pressing Right must take the next card
 * along however close the Row underneath happens to sit, and pressing Down must
 * take the card lined up below rather than the one nearest as the crow flies.
 */
const ACROSS_WEIGHT = 8;

/**
 * How far an item must be along the direction to count as being in it, so that
 * a card exactly level with the focused one is never reached by pressing Down.
 */
const MINIMUM_ALONG = 1;

/**
 * The index of the candidate focus should move to, or `undefined` when there is
 * nothing in that direction — the end of a Row, or the last Row on the screen.
 *
 * Candidates are scored by how far along the direction they are, plus the gap
 * across it weighted heavily, plus how far their centres are apart across it,
 * which separates two candidates that both overlap — a card can be under two
 * links of the navigation bar at once. The first of two equal candidates wins,
 * so the document's own order settles a tie.
 */
export function nearestInDirection(
  from: Box,
  candidates: readonly Box[],
  direction: Direction,
): number | undefined {
  let nearest: number | undefined = undefined;
  let bestScore = Number.POSITIVE_INFINITY;

  candidates.forEach((candidate, index) => {
    const along = alongDirection(from, candidate, direction);
    if (along < MINIMUM_ALONG) return;
    const score =
      along +
      acrossGap(from, candidate, direction) * ACROSS_WEIGHT +
      acrossCentreDistance(from, candidate, direction);
    if (score < bestScore) {
      bestScore = score;
      nearest = index;
    }
  });

  return nearest;
}

/**
 * How far the candidate's centre is along the direction. Negative for anything
 * behind, which is how an item in the wrong direction is dropped.
 */
function alongDirection(from: Box, candidate: Box, direction: Direction): number {
  switch (direction) {
    case 'Left':
      return centreX(from) - centreX(candidate);
    case 'Right':
      return centreX(candidate) - centreX(from);
    case 'Up':
      return centreY(from) - centreY(candidate);
    case 'Down':
      return centreY(candidate) - centreY(from);
  }
}

/**
 * The gap between the two boxes across the direction, and zero wherever they
 * overlap: two cards in the same Row are lined up, however wide they are.
 */
function acrossGap(from: Box, candidate: Box, direction: Direction): number {
  if (direction === 'Left' || direction === 'Right') {
    return Math.max(0, from.top - candidate.bottom, candidate.top - from.bottom);
  }
  return Math.max(0, from.left - candidate.right, candidate.left - from.right);
}

/**
 * How far apart the two boxes' centres are across the direction. It separates
 * candidates the gap above cannot: everything in a navigation bar overlaps the
 * card below it, so only the centres say which link is actually above it.
 */
function acrossCentreDistance(from: Box, candidate: Box, direction: Direction): number {
  if (direction === 'Left' || direction === 'Right') {
    return Math.abs(centreY(candidate) - centreY(from));
  }
  return Math.abs(centreX(candidate) - centreX(from));
}

function centreX(box: Box): number {
  return (box.left + box.right) / 2;
}

function centreY(box: Box): number {
  return (box.top + box.bottom) / 2;
}
