import { describe, expect, it } from 'vitest';
import { flattenAss } from '../../src/playback/ass';

/**
 * Flattening a styled subtitle file (#29): an ASS or SSA file read for its
 * **words and its timing**, with everything that makes it styled dropped.
 *
 * This is the half of the ticket that runs where a renderer cannot — the
 * Chromium 68 floor, a device whose capability profile says no, and a renderer
 * that failed to load — and the ticket asks for Vitest over exactly this.
 * Story 104: styled subtitles are shown with their styling where the device can
 * manage it, "and as plain text otherwise, so that they're always readable and
 * shiftable". Shiftable is the operative word: a flattened file comes out as
 * the same `SubtitleCue` list a WebVTT file does, so #28's offset stays the one
 * subtraction in `subtitles.tsx` and the Subtitle Offset works either way with
 * no second path to keep in step.
 *
 * Every expected value here is a written-out literal read off the ASS format
 * itself, never recomputed the way the flattener computes it.
 */

/** The smallest file with a real `[Events]` header, which is how ASS is shaped. */
function assFile(...events: readonly string[]): string {
  return [
    '[Script Info]',
    'ScriptType: v4.00+',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, Bold, Italic',
    'Style: Default,Arial,48,&H00FFFFFF,0,0',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    ...events,
  ].join('\n');
}

describe('flattening an ASS file to plain cues', () => {
  it('reads a dialogue line as a cue with its words and its times in seconds', () => {
    expect(
      flattenAss(assFile('Dialogue: 0,0:00:01.00,0:00:04.00,Default,,0,0,0,,Hello there.')),
    ).toEqual([{ start: 1, end: 4, text: 'Hello there.' }]);
  });

  /**
   * ASS counts **centiseconds**, not milliseconds: `0:00:01.50` is a second and
   * a half, and reading that field as thousandths would put the cue 1.05
   * seconds in — close enough to look right and wrong enough to drift.
   */
  it('reads the hundredths of a second ASS writes, not thousandths', () => {
    expect(
      flattenAss(assFile('Dialogue: 0,0:00:01.50,1:02:03.25,Default,,0,0,0,,Late.')),
    ).toEqual([{ start: 1.5, end: 3723.25, text: 'Late.' }]);
  });
});
