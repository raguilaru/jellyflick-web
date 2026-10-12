import { describe, expect, it } from 'vitest';
import {
  clampPosition,
  formatClock,
  fractionPlayed,
  positionForFraction,
  remainingSeconds,
  SEEK_STEP_SECONDS,
} from '../../src/playback/scrubbing';

/**
 * The arithmetic behind the seek bar and the two times (#26), on its own.
 *
 * It is pure on purpose: a seek bar is geometry and a clock, and neither needs
 * a media element to be wrong. What a browser is needed for — the bar really
 * moving the picture, the controls really hiding — is the journey test and
 * `test/e2e/playing-a-title.spec.ts`.
 */

describe('the clock beside the seek bar', () => {
  it('counts minutes and seconds below an hour, with the seconds padded', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(9)).toBe('0:09');
    expect(formatClock(70)).toBe('1:10');
    expect(formatClock(3599)).toBe('59:59');
  });

  it('counts hours once there is one, padding the minutes as well', () => {
    expect(formatClock(3600)).toBe('1:00:00');
    expect(formatClock(6761)).toBe('1:52:41');
  });

  it('drops the fraction of a second rather than rounding up to it', () => {
    // A position of 9.9 seconds is still the ninth second: rounding it up would
    // show a Title's last second as its length and read as a second too long.
    expect(formatClock(9.9)).toBe('0:09');
  });

  it('shows nothing it cannot know as zero, so the bar never reads NaN', () => {
    expect(formatClock(Number.NaN)).toBe('0:00');
    expect(formatClock(-5)).toBe('0:00');
    expect(formatClock(Number.POSITIVE_INFINITY)).toBe('0:00');
  });
});

describe('where the seek bar is', () => {
  it('is the fraction of the length played', () => {
    expect(fractionPlayed(30, 120)).toBe(0.25);
  });

  it('is at the start while the length is unknown, which is a live or unread source', () => {
    expect(fractionPlayed(30, undefined)).toBe(0);
    expect(fractionPlayed(30, 0)).toBe(0);
    expect(fractionPlayed(30, Number.NaN)).toBe(0);
  });

  it('says how much is left, for the readout on the right of the bar', () => {
    expect(remainingSeconds(30, 120)).toBe(90);
    expect(formatClock(remainingSeconds(30, 120))).toBe('1:30');
  });

  it('has nothing left to say about a source of unknown length', () => {
    expect(remainingSeconds(30, undefined)).toBe(0);
  });

  it('never leaves the bar, however far past its end a source reports', () => {
    expect(fractionPlayed(200, 120)).toBe(1);
    expect(fractionPlayed(-1, 120)).toBe(0);
  });

  it('turns a press on the bar back into a position', () => {
    expect(positionForFraction(0.25, 120)).toBe(30);
    expect(positionForFraction(1.4, 120)).toBe(120);
    expect(positionForFraction(-0.2, 120)).toBe(0);
  });

  it('cannot place a press on a bar of unknown length', () => {
    expect(positionForFraction(0.25, undefined)).toBe(undefined);
  });
});

describe('seeking by a step', () => {
  it('steps ten seconds, which is what a remote’s Left and Right are worth', () => {
    expect(SEEK_STEP_SECONDS).toBe(10);
  });

  it('stops at the start rather than seeking before it', () => {
    expect(clampPosition(4 - SEEK_STEP_SECONDS, 120)).toBe(0);
  });

  it('stops a whisker before the end, so seeking right never ends the Title', () => {
    // Seeking to exactly the end fires `ended`, and a User pressing Right has
    // not asked to leave the player.
    expect(clampPosition(200, 120)).toBe(119);
  });

  it('seeks freely while the length is unknown', () => {
    expect(clampPosition(200, undefined)).toBe(200);
    expect(clampPosition(-3, undefined)).toBe(0);
  });
});
