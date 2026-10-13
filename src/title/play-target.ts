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
