/**
 * The arithmetic behind the seek bar and the times beside it (#26).
 *
 * It is pure, and separate from the controls that draw it, because every one of
 * these is a thing a media element can report badly: a length of `NaN` before
 * the metadata has arrived, a position a hair past the end, a live source with
 * no length at all. A seek bar that shows `NaN:NaN` for a frame, or that seeks
 * to the very end and so closes the player, is this file's fault rather than
 * the component's, and it can be pinned without a browser.
 */

/** What Left, Right and a remote's Rewind and Fast Forward are worth. */
export const SEEK_STEP_SECONDS = 10;

/**
 * How close to the end a seek is allowed to land. Seeking to exactly the end
 * fires `ended`, which closes the player and reports the stop — and a User
 * pressing Right has not asked to leave.
 */
const END_MARGIN_SECONDS = 1;

/**
 * A position as a clock: `3:20` under an hour and `1:52:41` over one, which is
 * what every player a User has seen shows. Not translated, because these are
 * digits and a colon in every locale this app ships.
 *
 * Anything a media element cannot answer — `NaN` before the metadata, infinity
 * for a live source, a negative position — reads as the start rather than as
 * nonsense.
 */
export function formatClock(seconds: number): string {
  const whole = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const hours = Math.floor(whole / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const rest = whole % 60;
  if (hours > 0) {
    return `${String(hours)}:${pad(minutes)}:${pad(rest)}`;
  }
  return `${String(minutes)}:${pad(rest)}`;
}

/**
 * How far along the bar is, in [0, 1]. A source whose length is not known yet
 * reads as the start: a bar that cannot say where it is says the beginning
 * rather than guessing.
 */
export function fractionPlayed(position: number, duration: number | undefined): number {
  const length = usableDuration(duration);
  if (length === undefined) return 0;
  if (!Number.isFinite(position) || position <= 0) return 0;
  return Math.min(1, position / length);
}

/** Where a press that fraction of the way along the bar means, in seconds. */
export function positionForFraction(
  fraction: number,
  duration: number | undefined,
): number | undefined {
  const length = usableDuration(duration);
  if (length === undefined) return undefined;
  return Math.min(1, Math.max(0, fraction)) * length;
}

/** The time left, for the readout on the right of the bar. */
export function remainingSeconds(position: number, duration: number | undefined): number {
  const length = usableDuration(duration);
  if (length === undefined) return 0;
  return Math.max(0, length - Math.max(0, position));
}

/**
 * A seek brought inside the Title: never before the start, and never onto the
 * end itself. A source of unknown length can only be stopped from going
 * backwards.
 */
export function clampPosition(seconds: number, duration: number | undefined): number {
  const wanted = Number.isFinite(seconds) ? Math.max(0, seconds) : 0;
  const length = usableDuration(duration);
  if (length === undefined) return wanted;
  return Math.min(wanted, Math.max(0, length - END_MARGIN_SECONDS));
}

/** A length worth doing arithmetic with, or nothing. */
function usableDuration(duration: number | undefined): number | undefined {
  if (duration === undefined || !Number.isFinite(duration) || duration <= 0) return undefined;
  return duration;
}

function pad(value: number): string {
  return value < 10 ? `0${String(value)}` : String(value);
}
