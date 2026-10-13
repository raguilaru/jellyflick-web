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

  /** The styling itself: every override block goes, the words stay. */
  it('drops the override blocks and keeps what was between them', () => {
    expect(
      flattenAss(
        assFile(
          'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\i1}Hello{\\i0} there, {\\b1}friend{\\b0}.',
        ),
      ),
    ).toEqual([{ start: 1, end: 2, text: 'Hello there, friend.' }]);
  });

  it('drops a positioning block, which is styling and not words', () => {
    expect(
      flattenAss(
        assFile(
          'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\pos(960,120)\\fad(200,200)}A sign.',
        ),
      ),
    ).toEqual([{ start: 1, end: 2, text: 'A sign.' }]);
  });

  /** `\N` is ASS's hard line break, and a two-line subtitle is written with it. */
  it('turns ASS’s own line breaks into real ones', () => {
    expect(
      flattenAss(assFile('Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,First line\\Nsecond line')),
    ).toEqual([{ start: 1, end: 2, text: 'First line\nsecond line' }]);
  });

  it('reads `\\h`, a non-breaking space, as a space', () => {
    expect(
      flattenAss(assFile('Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Mr.\\hSmith')),
    ).toEqual([{ start: 1, end: 2, text: 'Mr. Smith' }]);
  });

  /** A line of dialogue may hold commas, and `Text` is the last column for it. */
  it('keeps the commas in a line of dialogue, which is why Text is the last column', () => {
    expect(
      flattenAss(
        assFile('Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Well, yes, but no.'),
      ),
    ).toEqual([{ start: 1, end: 2, text: 'Well, yes, but no.' }]);
  });

  /** `Comment:` is the format's own way of keeping a line without showing it. */
  it('leaves a commented-out line out', () => {
    expect(
      flattenAss(
        assFile(
          'Comment: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,A note to the typesetter.',
          'Dialogue: 0,0:00:05.00,0:00:06.00,Default,,0,0,0,,Shown.',
        ),
      ),
    ).toEqual([{ start: 5, end: 6, text: 'Shown.' }]);
  });

  /**
   * SSA v4.00 opens a row with `Marked=0` where v4.00+ opens it with a layer,
   * so a flattener that assumed the column positions would read `Marked=0` as
   * the layer and take the style name for the end time.
   */
  it('follows the Format line into SSA’s own column order', () => {
    expect(
      flattenAss(
        [
          '[Script Info]',
          'ScriptType: v4.00',
          '',
          '[Events]',
          'Format: Marked, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
          'Dialogue: Marked=0,0:00:02.00,0:00:03.00,Default,,0000,0000,0000,,An older file.',
        ].join('\n'),
      ),
    ).toEqual([{ start: 2, end: 3, text: 'An older file.' }]);
  });

  /**
   * `{\p1}` switches the text field into vector drawing mode, where what
   * follows is a path of coordinates. It is how a sign is typeset, and it is
   * common in exactly the subtitled material this ticket's styling exists for.
   * Flattened carelessly it draws a line of numbers over the picture where a
   * User expected speech, which reads as a bug in the player rather than as a
   * file this device cannot fully draw.
   */
  it('gives up a row that holds a vector drawing rather than words', () => {
    expect(
      flattenAss(
        assFile(
          'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\p1}m 0 0 l 100 0 100 100 0 100{\\p0}',
          'Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,Real speech.',
        ),
      ),
    ).toEqual([{ start: 3, end: 4, text: 'Real speech.' }]);
  });

  it('leaves out a row whose text was nothing but styling', () => {
    expect(
      flattenAss(assFile('Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,{\\fad(100,100)}')),
    ).toEqual([]);
  });

  /** The cursor walks the list in time order; a file is not obliged to be in it. */
  it('puts the cues in time order whatever order the file wrote them in', () => {
    expect(
      flattenAss(
        assFile(
          'Dialogue: 0,0:00:09.00,0:00:10.00,Default,,0,0,0,,Last.',
          'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,First.',
        ),
      ).map((cue) => cue.text),
    ).toEqual(['First.', 'Last.']);
  });

  /**
   * A `[Fonts]` section carries an embedded font as UU-encoded text, and its
   * payload is arbitrary. Only `[Events]` holds cues, which is what keeps a
   * blob that happens to read like a row out of the list.
   */
  it('reads cues from [Events] only, never from an embedded font’s payload', () => {
    expect(
      flattenAss(
        [
          '[Events]',
          'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
          'Dialogue: 0,0:00:01.00,0:00:02.00,Default,,0,0,0,,Real.',
          '',
          '[Fonts]',
          'fontname: custom_0.ttf',
          'Dialogue: 0,0:00:03.00,0:00:04.00,Default,,0,0,0,,Not a cue at all.',
        ].join('\n'),
      ),
    ).toEqual([{ start: 1, end: 2, text: 'Real.' }]);
  });

  it('answers no cues for a file it cannot read, as the WebVTT parser does', () => {
    expect(flattenAss('')).toEqual([]);
    expect(flattenAss('not a subtitle file at all')).toEqual([]);
  });

  /** A row that ends before it starts would otherwise never leave the screen. */
  it('drops a row whose end is not after its start', () => {
    expect(
      flattenAss(assFile('Dialogue: 0,0:00:05.00,0:00:05.00,Default,,0,0,0,,Instant.')),
    ).toEqual([]);
  });
});
