import type { EpisodeDetails, TitleDetails } from '../catalogue/catalogue';
import type { Translate } from '../i18n/index';
import type { JellyfinGateway } from '../jellyfin/gateway';
import { loadSeries } from './series';
import { playingNameOf } from './series-episodes';

/**
 * What pressing Play on a Title means (#18, and #16's Billboard).
 *
 * A Movie is its own file, so Play means the Title. **A Series holds no file at
 * all**: its Play means the Episode the User is up to, and asking the Server to
 * play a Series id answers no `MediaSources` and so fails. That is one rule
 * about the domain rather than about a screen, which is why it lives here
 * rather than inside the title page that needed it first — the Billboard
 * features Series as readily as Movies and has the same Play to honour.
 */

export type PlayTarget = {
  readonly itemId: string;
  /** What the player is headed with, which for an Episode names its Series. */
  readonly name: string;
  /** Where to start, left out for anything nobody has part-watched. */
  readonly resumeTicks?: number;
  /**
   * Which Series this belongs to, for an Episode and only for one (#31).
   *
   * It is what lets the player ask what comes **after** what it is playing:
   * the answer is a position in that Series' own aired order, and nothing else
   * the player holds says which Series an Episode is from. A Movie has none,
   * which is also how "there is nothing after this" is said without asking the
   * Server a question about a shape a Movie is not.
   */
  readonly seriesId?: string;
};

/**
 * One Episode as something to play.
 *
 * A finished Episode keeps the position playback ended at, and that is not a
 * place to start it from — the Title's own rule too (#25).
 */
export function episodePlayTarget(
  seriesName: string,
  detail: EpisodeDetails,
  t: Translate,
): PlayTarget {
  return {
    itemId: detail.episode.itemId,
    name: playingNameOf(seriesName, detail, t),
    seriesId: detail.episode.series.itemId,
    ...(detail.playback.played || detail.playback.positionTicks === undefined
      ? {}
      : { resumeTicks: detail.playback.positionTicks }),
  };
}

/** A Movie as something to play: itself, resuming where the User left off. */
export function moviePlayTarget(details: TitleDetails): PlayTarget {
  return {
    itemId: details.title.itemId,
    name: details.title.name,
    ...(details.resumePositionTicks === undefined
      ? {}
      : { resumeTicks: details.resumePositionTicks }),
  };
}

/**
 * What Play means for a Title whose Episodes are already in hand — the title
 * page, which read them to draw its Season picker.
 *
 * `undefined` for a Series the Server listed no Episodes of: there is nothing
 * to play, and a button that could only fail is worse than no button.
 */
export function playTargetFor(
  details: TitleDetails,
  upTo: EpisodeDetails | undefined,
  t: Translate,
): PlayTarget | undefined {
  if (details.title.kind !== 'Series') return moviePlayTarget(details);
  return upTo === undefined ? undefined : episodePlayTarget(details.title.name, upTo, t);
}

/**
 * What Play means where the Episodes have *not* been read — the Billboard,
 * which draws one Title out of a library query and never opens its page.
 *
 * A Movie is answered without asking the Server anything; only a Series costs
 * the two reads `loadSeries` makes, and only once its Play is pressed. That is
 * the whole reason this is separate from `playTargetFor`: the Billboard would
 * otherwise read the Episodes of every Series it features whether or not
 * anybody pressed anything.
 */
export async function resolvePlayTarget(
  gateway: JellyfinGateway,
  details: TitleDetails,
  t: Translate,
): Promise<PlayTarget | undefined> {
  if (details.title.kind !== 'Series') return moviePlayTarget(details);
  const series = await loadSeries(gateway, details.title.itemId);
  return playTargetFor(details, series.upTo, t);
}

/**
 * Which Episode follows the one playing, out of every Episode of the Series in
 * the Server's aired order (#31, story 88).
 *
 * It is a **position in that one list**, which is why `SeriesPage` keeps the
 * Episodes beside the Seasons: the question spans Seasons, so a household that
 * has just watched a Season finale is offered the next Season's first Episode
 * rather than nothing.
 *
 * Two things it deliberately does not do:
 *
 * - **It does not skip an Episode the User has already watched.** The Server's
 *   order is the order a Series is watched in, and deciding that a household
 *   has finished with something is not this rule's to make — a rewatch is as
 *   ordinary as a first watch.
 * - **It answers nothing for an item that is not in the list.** A Movie, or an
 *   Episode of another Series, has nothing after it here, and starting this
 *   list's first Episode instead would begin a programme nobody asked for.
 */
export function nextEpisodeIn(
  episodes: readonly EpisodeDetails[],
  playingItemId: string,
): EpisodeDetails | undefined {
  const playing = episodes.findIndex((detail) => detail.episode.itemId === playingItemId);
  if (playing === -1) return undefined;
  return episodes[playing + 1];
}

/**
 * What the player offers at the end of an Episode: the next one, read off the
 * Server, or nothing.
 *
 * The read is `loadSeries`' own two calls, which is the same pair the title
 * page made — so this is the Billboard's bargain in reverse. It happens once
 * per Episode and only as that Episode nears its end, rather than beside every
 * playback: an Episode somebody abandons half way through never costs it.
 *
 * A Server that will not say what the Series holds comes to `undefined` rather
 * than to a message, because `loadSeries` already turns a refused read into an
 * empty Series. To a User the two are the same thing — the Episode they were
 * watching has finished and there is nothing being offered — and an Episode
 * that ran out is not the moment to explain a failed library query.
 */
export async function resolveNextEpisode(
  gateway: JellyfinGateway,
  seriesId: string,
  playingItemId: string,
  t: Translate,
): Promise<PlayTarget | undefined> {
  const series = await loadSeries(gateway, seriesId);
  const next = nextEpisodeIn(series.episodes, playingItemId);
  if (next === undefined) return undefined;
  return episodePlayTarget(next.episode.series.name, next, t);
}
