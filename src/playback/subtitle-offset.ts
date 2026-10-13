import type { SubtitleCue } from './subtitle-cues';
import type { SubtitleTrack } from './media-tracks';

/**
 * The Subtitle Offset (#28, stories 96–102): how far the subtitles are shifted
 * from the picture, and which subtitle file that shift belongs to.
 *
 * It is the arithmetic half, with no DOM and no Server in it — the same bargain
 * `subtitle-cues.ts` makes. `subtitle-timing.tsx` is the panel a User presses,
 * `player.tsx` holds the offset in force, and `subtitles.tsx` subtracts it.
 *
 * ## The sign is the readout's own
 *
 * A **positive** offset means the subtitles arrive **later** than the picture,
 * which is what "Subtitles 0.8 s later" says. Drawing is one subtraction —
 * `cursor.at(position - offset)` — so a cue that the file puts at 10 s is drawn
 * at 10.8 s. The common complaint is subtitles that run ahead of the sound, and
 * the fix for that is a positive offset, so the sign that needs no explanation
 * on screen is the one a User reaches for first.
 *
 * ## Everything is on the tenth-of-a-second grid
 *
 * The step is 0.1 s, which in binary floating point is not a tenth: adding it
 * three times gives `0.30000000000000004`, and a readout drawn from that number
 * says so. So **every** function here rounds its answer to one decimal place —
 * the step, "Sync to this line", and the stored value on the way back in — and
 * the offset is therefore always a number the readout can print as it is.
 *
 * ## It is a seam, not a feature of one renderer
 *
 * #29 (styled subtitles) and #30 (image subtitles) each draw their own cues
 * with their own renderer, and both have to keep this offset working: libass
 * takes a `timeOffset` and `libpgs` takes one too (`player-subtitles.md` §6a and
 * §6b). What they share is this module and the one `offsetSeconds` the player
 * passes down — so neither of them has to know how an offset is stored, and
 * nothing here knows how a cue is drawn. #30's burned-in case is the one place
 * that has to say the offset cannot apply: the *panel* is what it disables, not
 * anything in here.
 */

/** The step the ± buttons take, which story 97 fixes at a tenth of a second. */
export const SUBTITLE_OFFSET_STEP_SECONDS = 0.1;

/**
 * As far as the offset goes in either direction.
 *
 * Holding a button on a remote repeats for as long as a thumb stays down, and
 * an offset of several minutes leaves a User with no subtitles at all and no
 * visible way back — Reset would be the only one. Thirty seconds is far more
 * than any real mistiming and still small enough to walk out of by hand.
 */
export const MAX_SUBTITLE_OFFSET_SECONDS = 30;

/**
 * How many files' offsets are kept.
 *
 * All of them live in one `CustomPrefs` string on a Server that is somebody's
 * Raspberry Pi, so the list cannot grow with every file a household ever
 * watched. The newest write goes last, so what survives is what is being
 * watched now.
 */
export const STORED_SUBTITLE_OFFSET_LIMIT = 100;

/** One subtitle file's offset, as it is stored. */
export type SubtitleOffset = {
  /** What `subtitleFileOf` answers: which file this shift belongs to. */
  readonly file: string;
  /** Seconds, positive for subtitles later than the picture. */
  readonly seconds: number;
};

/**
 * Which subtitle file a track is, which is what an offset is remembered per
 * (story 102).
 *
 * **A path where the Server gave one.** `MediaStream.Path` is set for an
 * external subtitle file (`jellyfin-playback.md` §14 lists it among the fields
 * a client may read), and two Episodes really can point at the same one — a
 * single `.srt` for a double-length pilot, or a subtitle pack a household
 * dropped beside a season. That is the only way story 102's "every Episode that
 * uses the same file" is reachable at all, so the path wins where it exists.
 *
 * **The media source and the stream otherwise.** A track muxed into the video
 * has no file of its own: the file is the video, which the media source id
 * names, and the stream inside it is `MediaStream.Index`. Two Episodes of a
 * Series have different sources and so different keys, which is right — their
 * subtitles are different files.
 *
 * The two shapes are prefixed so they can never collide, and so a stored key
 * says which kind it was without being parsed.
 */
export function subtitleFileOf(track: SubtitleTrack, mediaSourceId: string): string {
  if (track.path !== undefined && track.path !== '') return `path:${track.path}`;
  return `stream:${mediaSourceId}:${String(track.index)}`;
}

/**
 * The offset after some steps of the ± buttons. Several steps at once is a
 * button being held: the panel repeats faster the longer it is held, and that
 * is a bigger `steps` rather than more calls.
 */
export function shiftSubtitleOffset(seconds: number, steps: number): number {
  const from = Number.isFinite(seconds) ? seconds : 0;
  return clampOffset(from + steps * SUBTITLE_OFFSET_STEP_SECONDS);
}

/**
 * The offset that puts the line **on the screen now** at the moment this was
 * pressed (story 100).
 *
 * A User presses it as they hear the line they can see, so that line has to
 * start where the picture is: the new offset is `position - cue.start`, and it
 * is deliberately independent of the offset already in force — pressing it a
 * second time at the same moment changes nothing.
 *
 * Which line that is *does* depend on the offset in force, because that is what
 * decides which cue is drawn. Of two cues on the screen at once — a sign over a
 * speaker's line — the one that started last is the line just heard.
 *
 * `undefined` when there is no line on the screen. There is nothing to sync to
 * then, and guessing at the next cue would move the subtitles by an amount the
 * User never saw a reason for; the panel offers the button only when this
 * answers.
 */
export function offsetToSyncToLine(options: {
  cues: readonly SubtitleCue[];
  /** Where the picture is, in seconds. */
  position: number;
  /** The offset in force, which is what decides which cue is drawn. */
  offset: number;
}): number | undefined {
  const { cues, position, offset } = options;
  if (!Number.isFinite(position)) return undefined;

  // The moment the cues are read at, which is where `subtitles.tsx` reads them.
  const readAt = position - (Number.isFinite(offset) ? offset : 0);

  let line: SubtitleCue | undefined;
  for (const cue of cues) {
    if (cue.start > readAt || cue.end <= readAt) continue;
    if (line === undefined || cue.start >= line.start) line = cue;
  }
  if (line === undefined) return undefined;

  return clampOffset(position - line.start);
}

/** The offset stored for a file, or none, which is no shift at all. */
export function subtitleOffsetFor(
  offsets: readonly SubtitleOffset[],
  file: string,
): number {
  for (const stored of offsets) {
    if (stored.file === file) return stored.seconds;
  }
  return 0;
}

/**
 * The stored offsets with one file's changed.
 *
 * **An offset of nothing forgets the file** rather than storing a zero: a User
 * who has put a file back in sync — which is what Reset does — has nothing to
 * remember, and a zero per file a household ever watched would fill the one
 * string these live in with entries that say nothing.
 *
 * The changed file goes to the **newest end**, and the oldest falls off once
 * there are more than the limit, so a household keeps the offsets for what it
 * is watching rather than for whatever it watched first.
 */
export function withSubtitleOffset(
  offsets: readonly SubtitleOffset[],
  file: string,
  seconds: number,
): readonly SubtitleOffset[] {
  const without = offsets.filter((stored) => stored.file !== file);
  const rounded = clampOffset(seconds);
  if (rounded === 0) return without;

  const withIt = [...without, { file, seconds: rounded }];
  return withIt.length <= STORED_SUBTITLE_OFFSET_LIMIT
    ? withIt
    : withIt.slice(withIt.length - STORED_SUBTITLE_OFFSET_LIMIT);
}

/** The stored list, which is one `CustomPrefs` string. */
export function serialiseSubtitleOffsets(offsets: readonly SubtitleOffset[]): string {
  return JSON.stringify(offsets);
}

/**
 * Reads the stored list. An entry that cannot be read is dropped on its own and
 * anything that is not a list at all reads as empty, which is the treatment a
 * stored Home Layout's unknown Row kind gets: the worst a lost entry does is a
 * User shifting one file again, and the worst a *trusted* broken one does is
 * subtitles nobody can find.
 */
export function parseSubtitleOffsets(
  stored: string | null | undefined,
): readonly SubtitleOffset[] {
  if (stored === null || stored === undefined || stored === '') return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const offsets: SubtitleOffset[] = [];
  for (const candidate of parsed) {
    if (candidate === null || typeof candidate !== 'object') continue;
    const { file, seconds } = candidate as Record<string, unknown>;
    if (typeof file !== 'string' || file === '') continue;
    if (typeof seconds !== 'number' || !Number.isFinite(seconds)) continue;
    // Clamped on the way in as well as on the way out: a value a newer
    // Jellyflick — or a hand-edited one — put out of range must not leave a
    // User with subtitles they will never see.
    const rounded = clampOffset(seconds);
    if (rounded === 0) continue;
    if (offsets.some((held) => held.file === file)) continue;
    offsets.push({ file, seconds: rounded });
  }
  return offsets;
}

/** On the grid the readout prints, and inside the ends a User can walk back. */
function clampOffset(seconds: number): number {
  if (!Number.isFinite(seconds)) return 0;
  const tenths = Math.round(seconds * 10) / 10;
  if (tenths > MAX_SUBTITLE_OFFSET_SECONDS) return MAX_SUBTITLE_OFFSET_SECONDS;
  if (tenths < -MAX_SUBTITLE_OFFSET_SECONDS) return -MAX_SUBTITLE_OFFSET_SECONDS;
  // `|| 0`, so a rounded `-0` is the same zero every caller compares against.
  return tenths || 0;
}
