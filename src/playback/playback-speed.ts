/**
 * How fast a Title plays (#32, story 91).
 *
 * `HTMLMediaElement.playbackRate` is Chrome 3 and needs nothing at all — no
 * feature test, no polyfill, no device-layer seam (`player-subtitles.md` §8b).
 * So the only thing worth writing down is **which rates to offer**, and that
 * is a real decision rather than a list.
 *
 * **0.5x to 2x**, and the floor and the ceiling are the interesting ends:
 * Chromium mutes audio outside roughly 0.5x–4x, because its pitch
 * preservation gives up, and a speed control that silently takes the sound
 * away is worse than no speed control. §8b says to choose the range rather
 * than discover it, so this one stops where the sound does.
 */

/** A Title plays at its own speed until a User says otherwise. */
export const NORMAL_SPEED = 1;

/**
 * The rates offered, slowest first. Quarter steps through the middle, where a
 * User actually lives, and no 0.25x or 4x at the ends — see the note above.
 */
export const PLAYBACK_SPEEDS: readonly number[] = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/**
 * A rate brought inside the range the sound survives.
 *
 * It exists because a rate can come from somewhere other than a press — a
 * stored value, a remote, a later ticket — and a media element will happily
 * accept 16x and play it in silence.
 */
export function clampSpeed(rate: number): number {
  if (!Number.isFinite(rate) || rate <= 0) return NORMAL_SPEED;
  const slowest = PLAYBACK_SPEEDS[0] as number;
  const fastest = PLAYBACK_SPEEDS[PLAYBACK_SPEEDS.length - 1] as number;
  return Math.min(fastest, Math.max(slowest, rate));
}
