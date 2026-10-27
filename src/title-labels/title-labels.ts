import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { catalogueItemFrom, titleOf } from '../catalogue/catalogue';
import type { JellyfinGateway } from '../jellyfin/gateway';

/**
 * Title Labels: the word on a card's art saying what is new about it (#14,
 * story 42).
 *
 * A label is about what was **added to the Server**, which is not the same
 * thing as the Title it ends up on: a Series is not re-added when it gets a new
 * Episode, so "New Episodes" on Severance's card comes from an *Episode's*
 * `DateCreated`. That is why there is one query for the whole feature — the
 * newest additions of all four kinds — and one map from a Title's id to its
 * label, rather than a field on a card the Server could have filled in.
 *
 * The clock is the device layer's, never `Date.now()`: a label is a statement
 * about a date and a fixed clock is what makes it testable.
 */

/**
 * The labels, and their priority: at most one is drawn, and the first of these
 * that applies wins.
 *
 * The order is the strength of the claim. A Title that is itself new is new
 * however much of it arrived — saying "New Episodes" about a Series added
 * yesterday would be true and useless. A whole Season beats a handful of
 * Episodes for the same reason.
 */
export type TitleLabel = 'recently-added' | 'new-season' | 'new-episodes';

export const TITLE_LABEL_PRIORITY: readonly TitleLabel[] = [
  'recently-added',
  'new-season',
  'new-episodes',
];

/** How recent "recently" is. Story 42 says about a fortnight; this is it. */
export const RECENTLY_ADDED_DAYS = 14;

const DAY_IN_MILLISECONDS = 24 * 60 * 60 * 1000;

/**
 * How many of the newest additions are read. The Server has no "added since"
 * filter on `/Items`, so the window is a count: enough that a household that
 * imported a boxed set last week still gets labels on everything else.
 */
export const RECENT_ADDITIONS_LIMIT = 200;

/** A Title's id to the one label its card shows. Titles with none are absent. */
export type TitleLabels = ReadonlyMap<string, TitleLabel>;

export const NO_TITLE_LABELS: TitleLabels = new Map<string, TitleLabel>();

/**
 * The labels the Server's newest additions earn, by the id of the Title whose
 * card shows each one.
 *
 * Every rule is here, and all of them are a pure function of the additions and
 * the clock:
 *
 * - a **Movie or a Series** that was added itself is `recently-added`;
 * - a **Season** says its Series has a `new-season`;
 * - an **Episode** says its Series has `new-episodes`;
 * - an addition older than {@link RECENTLY_ADDED_DAYS} says nothing at all, and
 *   neither does one the Server gave no date — a label is a claim about a date,
 *   so no date is no claim;
 * - anything that is not one of the four kinds (an album, a stray video file)
 *   is not an addition this app has anything to say about.
 *
 * One label per Title, by {@link TITLE_LABEL_PRIORITY}: a Series whose Season
 * *and* Episodes arrived this week has a new Season, and that is all its card
 * says.
 */
export function titleLabelsFrom(
  additions: readonly BaseItemDto[],
  now: number,
): TitleLabels {
  const oldestThatCounts = now - RECENTLY_ADDED_DAYS * DAY_IN_MILLISECONDS;
  const labels = new Map<string, TitleLabel>();

  for (const dto of additions) {
    const item = catalogueItemFrom(dto);
    if (item === undefined) continue;
    // No date is no claim. A date in the *future* is kept, because a Server
    // whose clock runs a little ahead of the device's has still just added it.
    if (item.addedAt === undefined || item.addedAt < oldestThatCounts) continue;

    const label = labelFor(item.kind);
    const titleId = titleOf(item).itemId;
    const shown = labels.get(titleId);
    if (shown !== undefined && strengthOf(shown) <= strengthOf(label)) continue;
    labels.set(titleId, label);
  }

  return labels;
}

/**
 * Reads the Server's newest additions and turns them into labels. A Server that
 * will not say is no labels rather than a problem on the screen: a label is
 * something extra on a card, and a Row that drew an error instead of its Titles
 * would be a worse answer than a Row with no labels on it.
 */
export async function loadTitleLabels(
  gateway: JellyfinGateway,
  now: number,
  limit: number = RECENT_ADDITIONS_LIMIT,
): Promise<TitleLabels> {
  try {
    return titleLabelsFrom(await gateway.getRecentAdditions({ limit }), now);
  } catch {
    return NO_TITLE_LABELS;
  }
}

function labelFor(kind: 'Movie' | 'Series' | 'Season' | 'Episode'): TitleLabel {
  switch (kind) {
    case 'Movie':
    case 'Series':
      return 'recently-added';
    case 'Season':
      return 'new-season';
    case 'Episode':
      return 'new-episodes';
  }
}

function strengthOf(label: TitleLabel): number {
  return TITLE_LABEL_PRIORITY.indexOf(label);
}
