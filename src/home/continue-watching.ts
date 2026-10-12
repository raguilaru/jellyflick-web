import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import { catalogueItemFrom, playbackStateOf, titleOf, type Title } from '../catalogue/catalogue';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { cardForTitle, type RowCard } from './row';

/**
 * Continue Watching: everything the User has started and not finished, together
 * with the next unwatched Episode of each Series they are watching (#12,
 * stories 35 to 39).
 *
 * The Server has no one endpoint for it, and deliberately so — the two halves
 * are different questions:
 *
 *   `GET /UserItems/Resume`  what is part-watched, with where they got to
 *   `GET /Shows/NextUp`      which Episode comes next in each Series
 *   `GET /Items?isPlayed`    when each Series was last watched (see below)
 *
 * so the Row is three reads and this module is the merge. A Series appears once
 * however many of its Episodes either answer mentions, because an entry is
 * keyed by the **Title** — the Movie, or the Series — while the thing that is
 * resumable is the Movie or one Episode of it.
 *
 * **Why the third read.** "Ordered by most recent activity" is `LastPlayedDate`
 * for anything part-watched, and the next unwatched Episode of a Series has
 * never been played, so it has none: ordering a Series by *it* would put a show
 * finished an hour ago below a film abandoned last month. The Episode before it
 * has a date, and that is the Series' activity. One query answers that for
 * every Series at once.
 */

/** A hidden Series, and what its activity was when the User hid it. */
export type HiddenSeries = {
  readonly seriesId: string;
  /**
   * The Series' most recent activity at the moment it was hidden, in
   * milliseconds. This is what makes hiding undo itself: an Episode played
   * afterwards moves the Series' activity past this, and story 39's "it
   * reappears automatically" is that comparison rather than a second write.
   *
   * Zero for a Series whose activity the Server would not say, so the next
   * thing the User plays brings it back.
   */
  readonly hiddenAt: number;
};

/** One thing to carry on watching: a part-watched Movie, or an Episode. */
export type ContinueWatchingItem = {
  /**
   * The Movie or Episode itself — what is resumed, and what a resume point
   * belongs to. Taking an entry out of the Row is a write against *this*.
   */
  readonly itemId: string;
  /** The Movie, or the Series the Episode belongs to: whose card is drawn. */
  readonly title: Title;
  /** Set when the entry is an Episode, which is what can be hidden. */
  readonly seriesId?: string;
  /** How far through the Movie or Episode the User is, from 0 to 1. */
  readonly progress: number;
  /** True when there is a resume point to clear. A next-up Episode has none. */
  readonly resumable: boolean;
  /** What the Row is ordered by: most recent first. */
  readonly activityAt: number;
};

/** One item as the Row draws it. */
export type ContinueWatchingEntry = ContinueWatchingItem & { readonly card: RowCard };

/**
 * What the merge came to: the Row, and any hidden Series the Row has decided to
 * forget about.
 *
 * The second is not housekeeping. A Series is hidden until its activity moves
 * on, so the record that hid it is spent the moment it appears again — and
 * leaving it in the settings would hide the Series a second time, the next time
 * its next Episode came round.
 */
export type ContinueWatchingMerge = {
  readonly items: readonly ContinueWatchingItem[];
  /** Hidden records that have done their job, by Series id. */
  readonly hiddenToForget: readonly string[];
};

/** How many entries the Row shows. */
export const CONTINUE_WATCHING_LIMIT = 20;

/**
 * How far back the "when was this Series last watched" query reaches. A
 * household's recent viewing, not its history: a Series whose last Episode was
 * played longer ago than this is one whose place in the Row nobody is watching
 * closely.
 */
export const PLAYED_EPISODES_LIMIT = 100;

/**
 * What the Server answered, kept as it came.
 *
 * The Row holds *this* rather than the merged entries, because hiding a Series
 * must show on the screen at once and asking the Server again is not how: the
 * merge is cheap, pure and run on every render, so the User's own list is the
 * only thing that changes.
 */
export type ContinueWatchingRead =
  | {
      outcome: 'read';
      resume: readonly BaseItemDto[];
      nextUp: readonly BaseItemDto[];
      playedEpisodes: readonly BaseItemDto[];
    }
  | { outcome: 'unavailable' };

/** The Row itself: the cards to draw, and the hidden records now spent. */
export type ContinueWatchingRow = {
  readonly entries: readonly ContinueWatchingEntry[];
  readonly hiddenToForget: readonly string[];
};

/**
 * Merges the two halves into one Row.
 *
 * - **A part-watched item wins over a next-up one** for the same Series: the
 *   User is in the middle of an Episode, so that is the one to offer, and the
 *   Episode after it is not news yet.
 * - **One entry per Title.** `/Shows/NextUp` already answers one Episode per
 *   Series, so this only has to collapse the two answers into each other — and
 *   a Series with two part-watched Episodes, which is real: the newer activity
 *   wins.
 * - **Most recent activity first**, which for a next-up Episode is its Series'
 *   (see the note at the top of this file). A Series whose activity nothing
 *   says sorts last, keeping the order `/Shows/NextUp` put it in — that order
 *   is the Server's own answer to the same question.
 * - **A hidden Series is left out** until its activity moves past the moment it
 *   was hidden. Whatever is left out stays in the User's watch history: hiding
 *   is about the Row and nothing else.
 */
export function mergeContinueWatching(options: {
  resume: readonly BaseItemDto[];
  nextUp: readonly BaseItemDto[];
  playedEpisodes?: readonly BaseItemDto[];
  hidden?: readonly HiddenSeries[];
  limit?: number;
}): ContinueWatchingMerge {
  const lastWatched = seriesActivityFrom(options.playedEpisodes ?? []);
  const hidden = options.hidden ?? [];

  /**
   * The best entry for each Title, by the Title's own item id, with the place
   * the Server answered in kept beside it. That rank is the tie-break: two
   * entries with the same activity — or none at all — keep the Server's order,
   * and `Array.prototype.sort` is only stable from Chromium 70, one above the
   * floor ADR 0002 sets, so the comparator cannot lean on it.
   */
  const best = new Map<string, Ranked>();
  let rank = 0;

  for (const [source, dtos] of [
    ['resume', options.resume],
    ['next-up', options.nextUp],
  ] as const) {
    for (const dto of dtos) {
      const item = itemFrom(dto, source, lastWatched);
      if (item === undefined) continue;
      rank += 1;

      const standing = best.get(item.title.itemId);
      if (standing !== undefined && !isBetterThan(item, standing.item)) continue;
      // The place in the Server's answer comes with the entry that won it.
      best.set(item.title.itemId, { item, rank });
    }
  }

  const shown: ContinueWatchingItem[] = [];
  const hiddenToForget: string[] = [];
  for (const { item } of Array.from(best.values()).sort(byActivity)) {
    const record = item.seriesId === undefined ? undefined : recordFor(hidden, item.seriesId);
    if (record === undefined) {
      shown.push(item);
      continue;
    }
    // Still hidden: nothing of this Series has been played since. A Series whose
    // activity is unknown is hidden at zero, so anything the User plays shows it.
    if (item.activityAt <= record.hiddenAt) continue;
    hiddenToForget.push(record.seriesId);
    shown.push(item);
  }

  return {
    items: shown.slice(0, options.limit ?? CONTINUE_WATCHING_LIMIT),
    // Every spent record, even one whose entry fell off the end of the Row:
    // the record has done its job either way.
    hiddenToForget,
  };
}

/**
 * Reads the Row from the Server. One failure is the whole Row's: unlike New on
 * Jellyflick, where a library that will not answer is simply a shorter Row,
 * half of this one silently missing would look like a User's own viewing having
 * been forgotten.
 */
export async function loadContinueWatching(
  gateway: JellyfinGateway,
  limit: number = CONTINUE_WATCHING_LIMIT,
): Promise<ContinueWatchingRead> {
  try {
    const [resume, nextUp, playedEpisodes] = await Promise.all([
      gateway.getResumeItems({ limit }),
      gateway.getNextUpItems({ limit }),
      gateway.getPlayedEpisodes({ limit: PLAYED_EPISODES_LIMIT }),
    ]);
    return { outcome: 'read', resume, nextUp, playedEpisodes };
  } catch {
    return { outcome: 'unavailable' };
  }
}

/**
 * What the Server said as the cards the Row draws: the merge, with the Titles
 * turned into cards the same way every other Row's are.
 *
 * `removed` is what the User has just taken out, which is not in the Server's
 * answer yet — a change shows before the Server has agreed to it, the bargain
 * My List makes (#13).
 */
export function continueWatchingRow(options: {
  gateway: JellyfinGateway;
  read: Extract<ContinueWatchingRead, { outcome: 'read' }>;
  hidden?: readonly HiddenSeries[];
  removed?: readonly string[];
  limit?: number;
}): ContinueWatchingRow {
  const merged = mergeContinueWatching({
    resume: options.read.resume,
    nextUp: options.read.nextUp,
    playedEpisodes: options.read.playedEpisodes,
    ...(options.hidden === undefined ? {} : { hidden: options.hidden }),
    ...(options.limit === undefined ? {} : { limit: options.limit }),
  });
  const removed = options.removed ?? [];

  return {
    entries: merged.items
      .filter((item) => removed.indexOf(item.itemId) === -1)
      .map((item) => ({
        ...item,
        card: { ...cardForTitle(options.gateway, item.title), progress: item.progress },
      })),
    hiddenToForget: merged.hiddenToForget,
  };
}

/** Takes the Series the Row has decided to forget out of the stored list. */
export function withoutHiddenSeries(
  hidden: readonly HiddenSeries[],
  seriesIds: readonly string[],
): readonly HiddenSeries[] {
  return hidden.filter((record) => seriesIds.indexOf(record.seriesId) === -1);
}

/** Hides a Series, or moves the moment an already hidden one was hidden. */
export function withHiddenSeries(
  hidden: readonly HiddenSeries[],
  record: HiddenSeries,
): readonly HiddenSeries[] {
  return [...withoutHiddenSeries(hidden, [record.seriesId]), record];
}

/** The stored list, which is one `CustomPrefs` string. */
export function serialiseHiddenSeries(hidden: readonly HiddenSeries[]): string {
  return JSON.stringify(hidden);
}

/**
 * Reads the stored list. Anything that cannot be read as one is read as an
 * empty list rather than as a reason to fail: the worst a lost record does is
 * show a Row entry the User had put away, and the worst a *trusted* broken one
 * does is hide a Series for good.
 */
export function parseHiddenSeries(stored: string | null | undefined): readonly HiddenSeries[] {
  if (stored === null || stored === undefined || stored === '') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const records: HiddenSeries[] = [];
  for (const candidate of parsed) {
    if (candidate === null || typeof candidate !== 'object') continue;
    const { seriesId, hiddenAt } = candidate as Record<string, unknown>;
    if (typeof seriesId !== 'string' || seriesId === '') continue;
    if (records.some((record) => record.seriesId === seriesId)) continue;
    records.push({
      seriesId,
      hiddenAt: typeof hiddenAt === 'number' && Number.isFinite(hiddenAt) ? hiddenAt : 0,
    });
  }
  return records;
}

/**
 * When each Series was last watched, from the Episodes the User has finished.
 * The Server answers newest first, so the first date seen for a Series is its
 * most recent one — but the order is not relied on, because a client that
 * depends on it breaks silently when the Server's does not match.
 */
function seriesActivityFrom(playedEpisodes: readonly BaseItemDto[]): ReadonlyMap<string, number> {
  const activity = new Map<string, number>();
  for (const dto of playedEpisodes) {
    const seriesId = dto.SeriesId;
    if (typeof seriesId !== 'string' || seriesId === '') continue;
    const { lastPlayedAt } = playbackStateOf(dto);
    if (lastPlayedAt === undefined) continue;
    const seen = activity.get(seriesId);
    if (seen === undefined || lastPlayedAt > seen) activity.set(seriesId, lastPlayedAt);
  }
  return activity;
}

function itemFrom(
  dto: BaseItemDto,
  source: 'resume' | 'next-up',
  lastWatched: ReadonlyMap<string, number>,
): ContinueWatchingItem | undefined {
  const item = catalogueItemFrom(dto);
  // A Season, or anything that is not a Title and not an Episode of one, is
  // nothing a User resumes. `/Shows/NextUp` answers with Episodes, and
  // `/UserItems/Resume` is asked for Movies and Episodes.
  if (item === undefined || item.kind === 'Season' || item.kind === 'Series') return undefined;

  const state = playbackStateOf(dto);
  // A finished item is not something to carry on with. The Server leaves these
  // out of both answers; a client that trusted that would show one the moment a
  // Server disagreed.
  if (source === 'resume' && state.played) return undefined;

  const seriesId = item.kind === 'Episode' ? item.series.itemId : undefined;

  return {
    itemId: item.itemId,
    title: titleOf(item),
    ...(seriesId === undefined ? {} : { seriesId }),
    progress: state.progress ?? 0,
    resumable: state.positionTicks !== undefined,
    activityAt: activityOf(state.lastPlayedAt, seriesId, lastWatched),
  };
}

/**
 * When this entry was last touched.
 *
 * For a Movie that is its own last-played date. For anything belonging to a
 * Series it is the **Series'** most recent activity — the later of the
 * Episode's own date and the newest played Episode of the show — and taking
 * the later of the two rather than just the Episode's is load-bearing twice
 * over:
 *
 * - a next-up Episode has never been played and has no date at all, so its
 *   Series' is the only thing to order it by;
 * - and hiding a Series stores this number, while the *next* load compares the
 *   Series' activity against it. Were the two different measures, hiding a
 *   part-watched Episode of a show with newer activity elsewhere — an abandoned
 *   Episode 5 and a rewatched Episode 1 — would store the older of the two and
 *   the Series would come straight back on the next load, taking its own
 *   hidden record with it.
 *
 * Zero when nothing says anything, which sorts the entry to the end of the Row
 * in the order the Server answered.
 */
function activityOf(
  lastPlayedAt: number | undefined,
  seriesId: string | undefined,
  lastWatched: ReadonlyMap<string, number>,
): number {
  const series = seriesId === undefined ? undefined : lastWatched.get(seriesId);
  return Math.max(lastPlayedAt ?? 0, series ?? 0);
}

/**
 * Whether one entry for a Title should be shown instead of another.
 *
 * A part-watched Episode beats a next-up one outright, whatever their dates:
 * the User is in the middle of it. Otherwise the more recent activity wins.
 */
function isBetterThan(candidate: ContinueWatchingItem, standing: ContinueWatchingItem): boolean {
  if (candidate.resumable !== standing.resumable) return candidate.resumable;
  return candidate.activityAt > standing.activityAt;
}

/** One entry and where the Server put it, which is the order's tie-break. */
type Ranked = { readonly item: ContinueWatchingItem; readonly rank: number };

function byActivity(left: Ranked, right: Ranked): number {
  const byMostRecent = right.item.activityAt - left.item.activityAt;
  return byMostRecent !== 0 ? byMostRecent : left.rank - right.rank;
}

function recordFor(
  hidden: readonly HiddenSeries[],
  seriesId: string,
): HiddenSeries | undefined {
  return hidden.find((record) => record.seriesId === seriesId);
}
