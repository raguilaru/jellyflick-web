import type {
  JellyfinGateway,
  MediaSegmentDto,
  MediaSegmentType,
} from '../jellyfin/gateway';

/**
 * The intro and credits markers a User is offered a skip for (#31, story 87).
 *
 * Every rule is a pure function of what the Server said, as `src/title/series.ts`
 * is: the player draws these answers and decides nothing of its own. There is
 * one call to the Server here, {@link readMediaSegments}, and it exists for a
 * single reason — a Server with no segment provider installed answers either a
 * **404** or an **empty result**, and `jellyfin-playback.md` §12 leaves which
 * open. Both mean "nothing to skip", and this is the one place they are made
 * the same thing so that no caller ever shows a User an error for the
 * ordinary case of a Server without an intro-detection plugin.
 *
 * **The credits marker is `Outro`.** `MediaSegmentType` is `Unknown,
 * Commercial, Preview, Recap, Outro, Intro` and holds no `Credits` value at
 * all (`decisions.md` §5), so a button labelled Skip Credits is driven by an
 * `Outro` segment.
 */

/**
 * The marker kinds this app offers a skip for, and so the only ones it asks
 * the Server to send.
 *
 * The parameter exists to narrow, and narrowing is the honest thing to do: a
 * Server whose detection plugin also found `Recap` and `Preview` segments —
 * "previously on" and "next time on", which §12 notes are worth offering —
 * would otherwise send markers nothing here draws a button for, and
 * `Commercial` is a Live TV concern this app never shows. Growing the offer to
 * `Recap` and `Preview` is one entry here and one translated label each, which
 * is the shape #31 deliberately left for whoever wants them.
 */
export const SKIPPABLE_SEGMENT_TYPES: readonly MediaSegmentType[] = ['Intro', 'Outro'];

/** The kinds of marker a skip is offered for. A credits marker is an `Outro`. */
export type MarkerKind = 'Intro' | 'Outro';

/** One marker, in the seconds a media element counts in. */
export type MediaMarker = {
  readonly kind: MarkerKind;
  readonly startSeconds: number;
  readonly endSeconds: number;
};

/** A skip the User is being offered now: which button, and where it lands. */
export type SkipOffer = {
  readonly kind: MarkerKind;
  /** Where pressing it seeks to, which is the end of the marker. */
  readonly toSeconds: number;
};

/** 100 nanoseconds, which is the unit every time on this API is in. */
const TICKS_PER_SECOND = 10_000_000;

/**
 * The markers among what the Server answered, in the Server's own order.
 *
 * Three kinds of answer are dropped rather than drawn, because a Skip button
 * that seeks nowhere is worse than no button at all — a User presses it, the
 * picture does not move, and nothing on the screen says why:
 *
 * - a kind there is no button for, so no caller has to guard against one;
 * - a marker missing either end, which a Server may really send;
 * - a span that does not go forwards, including one of no length at all.
 */
export function segmentsOf(segments: readonly MediaSegmentDto[]): readonly MediaMarker[] {
  const markers: MediaMarker[] = [];
  for (const segment of segments) {
    const kind = segment.Type;
    if (kind !== 'Intro' && kind !== 'Outro') continue;

    const startSeconds = secondsOfTicks(segment.StartTicks);
    const endSeconds = secondsOfTicks(segment.EndTicks);
    if (startSeconds === undefined || endSeconds === undefined) continue;
    if (endSeconds <= startSeconds) continue;

    markers.push({ kind, startSeconds, endSeconds });
  }
  return markers;
}

/**
 * Which skip is on the screen at one moment, or `undefined` for none.
 *
 * The offer stands for exactly as long as the marker does: it appears at the
 * marker's start and **goes away at its end** rather than lingering, because a
 * Skip Intro still there once the programme has started would throw a User
 * forward out of what they came to watch.
 *
 * Where two markers cover the same moment — a Server with a confused detection
 * plugin — the one that **started last** wins. That is the one the User is in
 * the middle of, and the answer has to be one button rather than two.
 */
export function skipOffered(
  markers: readonly MediaMarker[],
  positionSeconds: number,
): SkipOffer | undefined {
  if (!Number.isFinite(positionSeconds)) return undefined;

  let inside: MediaMarker | undefined;
  for (const marker of markers) {
    if (positionSeconds < marker.startSeconds) continue;
    if (positionSeconds >= marker.endSeconds) continue;
    if (inside === undefined || marker.startSeconds >= inside.startSeconds) inside = marker;
  }

  return inside === undefined ? undefined : { kind: inside.kind, toSeconds: inside.endSeconds };
}

/**
 * The markers one item has, or nothing at all.
 *
 * Nothing here is a failure a User sees. A Server with no segment provider is
 * the ordinary case rather than a fault, and it answers a 404 or an empty
 * result depending on the Server — so both come to an empty list, and so does
 * a Server that could not be reached. There is nothing a User could do about
 * any of the three, and a Title plays perfectly well with nothing to skip.
 */
export async function readMediaSegments(
  gateway: JellyfinGateway,
  itemId: string,
): Promise<readonly MediaMarker[]> {
  const segments = await gateway
    .getMediaSegments(itemId, SKIPPABLE_SEGMENT_TYPES)
    .catch(() => []);
  return segmentsOf(segments);
}

/** A tick count the Server really sent, as seconds. */
function secondsOfTicks(ticks: number | null | undefined): number | undefined {
  if (typeof ticks !== 'number' || !Number.isFinite(ticks) || ticks < 0) return undefined;
  return ticks / TICKS_PER_SECOND;
}
