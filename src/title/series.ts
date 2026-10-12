import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { catalogueItemFrom, episodeDetailsFrom, type EpisodeDetails } from '../catalogue/catalogue';
import type { JellyfinGateway } from '../jellyfin/gateway';

/**
 * What a Series is on its title page (#18): the Seasons there are to pick from,
 * the Episodes under each, and which one Episode a single press of Play means.
 *
 * Every rule here is a pure function of what the Server said, as
 * `src/home/continue-watching.ts` is: the screen in `series-episodes.tsx` draws
 * these answers and decides nothing itself.
 *
 * **The Server's own order is kept, and nothing here sorts the Episodes.**
 * `/Shows/{seriesId}/Episodes` answers in aired order, which is the order a
 * Series is watched in, and that is a property of the answer rather than
 * something a client should work out again — `Array.prototype.sort` is only
 * stable from Chromium 70, one above the floor ADR 0002 sets, so a re-sort
 * would also be the kind of thing that behaves differently on the target. The
 * Seasons are grouped out of that one list, so the list and the picker can
 * never disagree about which Episode comes next.
 */

/** One Season as the picker offers it, with the Episodes under it. */
export type SeriesSeason = {
  /**
   * Which Season this is, for the screen's own "which tab is chosen" state. It
   * is the Season item's id where the Server has one, and a made-up key for a
   * Season that is only a number on its Episodes — nothing is ever asked of
   * the Server with it.
   */
  readonly id: string;
  /** `IndexNumber` on the Season, or the `ParentIndexNumber` of its Episodes. */
  readonly seasonNumber?: number;
  /**
   * The Season's name as the Server has it — "Season 2", "Specials". Absent
   * for a Season the Server does not hold as an item of its own, which the
   * screen then names from {@link SeriesSeason.seasonNumber}.
   */
  readonly name?: string;
  readonly episodes: readonly EpisodeDetails[];
};

/** A Series as its title page reads it: what to pick from, and what to play. */
export type SeriesPage = {
  readonly seasons: readonly SeriesSeason[];
  /**
   * Every Episode of the Series in the Server's aired order, across Seasons.
   *
   * It is kept beside the Seasons rather than only inside them because the one
   * question that spans Seasons is asked of it: which Episode Play starts, and
   * — for #31, which has to know what comes after the Episode now playing —
   * which Episode follows this one. Both are a position in this one list.
   */
  readonly episodes: readonly EpisodeDetails[];
  /**
   * The Episode one press of Play means, by {@link episodeToPlay}. Absent for
   * a Series the Server listed no Episodes of, which is a Series with nothing
   * to play.
   *
   * It is worked out once, here, so the page's Play button and the Season the
   * list opens on can never mean two different Episodes.
   */
  readonly upTo?: EpisodeDetails;
};

/** A Series with nothing in it, which is what a failed read comes to. */
export const NO_SERIES: SeriesPage = { seasons: [], episodes: [] };

/**
 * Reads a Series' Seasons and Episodes off the Server, asked for at once.
 *
 * A Series that will not answer is an empty Series rather than a failed page:
 * the Title itself is what a title page cannot do without, and the Episodes
 * under it are read beside it for the same reason More like this is (#17).
 */
export async function loadSeries(
  gateway: JellyfinGateway,
  seriesId: string,
): Promise<SeriesPage> {
  const [seasons, episodes] = await Promise.all([
    gateway.getSeasons(seriesId).catch(() => []),
    gateway.getEpisodes(seriesId).catch(() => []),
  ]);

  const upTo = episodeToPlay(episodes);
  return {
    seasons: seasonsOf(seasons, episodes),
    episodes: episodeDetailsIn(episodes),
    ...(upTo === undefined ? {} : { upTo }),
  };
}

/**
 * The Seasons the picker offers, in the Server's order, each with the Episodes
 * that belong to it.
 *
 * - A Season the Server lists but holds **no Episodes of is left out**: a tab
 *   that shows nothing is worse than one Season fewer.
 * - Episodes whose Season the Server does not hold as an item of its own still
 *   get a Season, from the number on the Episodes themselves. Jellyfin really
 *   does serve those, and a Series whose Episodes were all in one unnamed heap
 *   would be the only Series with no picker at all.
 * - Episodes the Server placed **nowhere** — no Season number of their own —
 *   are gathered into one last Season with no number. There is nowhere else to
 *   put them, and leaving them out would hide Episodes a User can play.
 */
export function seasonsOf(
  seasons: readonly BaseItemDto[],
  episodes: readonly BaseItemDto[],
): readonly SeriesSeason[] {
  const details = episodeDetailsIn(episodes);
  const grouped: SeriesSeason[] = [];
  const taken: number[] = [];

  // The Seasons the Server holds as items, in the order it listed them. One
  // the Server gave no number is skipped rather than guessed at: there is
  // nothing on it to match an Episode by, and its Episodes are picked up as
  // unplaced below.
  for (const dto of seasons) {
    const item = catalogueItemFrom(dto);
    if (item === undefined || item.kind !== 'Season') continue;
    const seasonNumber = item.seasonNumber;
    if (seasonNumber === undefined) continue;

    const under = episodesOfSeason(details, seasonNumber);
    if (under.length === 0) continue;
    taken.push(seasonNumber);
    grouped.push({
      id: item.itemId,
      seasonNumber,
      name: item.name,
      episodes: under,
    });
  }

  // The Seasons only the Episodes know about, in number order. The numbers are
  // distinct, so this comparison decides every pair and never leans on a sort
  // being stable (ADR 0002: it is not, below Chromium 70).
  const missing: number[] = [];
  for (const detail of details) {
    const seasonNumber = detail.episode.seasonNumber;
    if (seasonNumber === undefined) continue;
    if (taken.indexOf(seasonNumber) !== -1) continue;
    if (missing.indexOf(seasonNumber) !== -1) continue;
    missing.push(seasonNumber);
  }
  for (const seasonNumber of missing.slice().sort((left, right) => left - right)) {
    grouped.push({
      id: `season-number-${String(seasonNumber)}`,
      seasonNumber,
      episodes: episodesOfSeason(details, seasonNumber),
    });
  }

  const unplaced = details.filter((detail) => detail.episode.seasonNumber === undefined);
  if (unplaced.length > 0) {
    grouped.push({ id: 'season-unplaced', episodes: unplaced });
  }

  return grouped;
}

/**
 * Which Episode one press of Play starts (story 69), out of every Episode of
 * the Series in the Server's order.
 *
 * - **An Episode the User is in the middle of wins**, because that is what
 *   "carry on watching" means. Where there are several, it is the one they
 *   played most recently — an Episode abandoned last night is where they are,
 *   not one given up on a month ago — and with no dates to go on, the first in
 *   the Server's order.
 * - A **finished** Episode is never resumed, however far through it is stored:
 *   the Server keeps the position playback ended at, and that is not an Episode
 *   anybody is in the middle of.
 * - Otherwise the **first unwatched** Episode, which is the next one to watch.
 * - A Series the User has finished starts at its **first** Episode again, so
 *   Play never does nothing on a show somebody wants to rewatch.
 */
export function episodeToPlay(
  episodes: readonly BaseItemDto[],
): EpisodeDetails | undefined {
  const details = episodeDetailsIn(episodes);

  let resuming: EpisodeDetails | undefined;
  for (const detail of details) {
    if (detail.playback.played) continue;
    if (detail.playback.positionTicks === undefined) continue;
    if (resuming === undefined || playedAfter(detail, resuming)) resuming = detail;
  }
  if (resuming !== undefined) return resuming;

  return details.find((detail) => !detail.playback.played) ?? details[0];
}

/**
 * Whether one Episode was played more recently than another. An Episode the
 * Server gave no date never beats one that has one, and two without dates leave
 * the Server's own order to decide — which is what the caller's "first wins"
 * already does.
 */
function playedAfter(candidate: EpisodeDetails, incumbent: EpisodeDetails): boolean {
  const theirs = incumbent.playback.lastPlayedAt;
  const ours = candidate.playback.lastPlayedAt;
  if (ours === undefined) return false;
  return theirs === undefined || ours > theirs;
}

/** The Episodes among an answer, as the list draws them, in the Server's order. */
function episodeDetailsIn(episodes: readonly BaseItemDto[]): readonly EpisodeDetails[] {
  return episodes
    .map((dto) => episodeDetailsFrom(dto))
    .filter((detail): detail is EpisodeDetails => detail !== undefined);
}

function episodesOfSeason(
  details: readonly EpisodeDetails[],
  seasonNumber: number,
): readonly EpisodeDetails[] {
  return details.filter((detail) => detail.episode.seasonNumber === seasonNumber);
}
