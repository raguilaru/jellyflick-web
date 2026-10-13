import { describe, expect, it } from 'vitest';
import { createCueCursor, parseSubtitles } from '../../src/playback/subtitle-cues';

/**
 * The subtitle engine's two halves (#27): turning a file into cues, and saying
 * which of them belongs on the screen at a moment.
 *
 * This is what the ticket's "Vitest covers parsing and timing" is about, and it
 * is a unit test rather than a journey because every rule here is arithmetic
 * and grammar. The expected values are written-out literals from the WebVTT
 * and SubRip grammars, never recomputed the way the parser computes them.
 *
 * The timing half is a **cursor** rather than a filter because
 * `docs/research/player-subtitles.md` §6c is explicit about it: this runs on
 * every animation frame against a film that can hold 2,000 cues, on a weak TV
 * SoC. A cursor has a state to get wrong, so seeking backwards and jumping
 * about are tested here as first-class cases.
 */

describe('parsing a subtitle file', () => {
  it('reads a WebVTT file into cues with their times in seconds', () => {
    const cues = parseSubtitles(
      ['WEBVTT', '', '00:00:01.000 --> 00:00:04.000', 'Hello.', '', '00:01:02.500 --> 00:01:05.250', 'Goodbye.'].join('\n'),
    );

    expect(cues).toEqual([
      { start: 1, end: 4, text: 'Hello.' },
      { start: 62.5, end: 65.25, text: 'Goodbye.' },
    ]);
  });

  /** SubRip's separator is a comma, and its cues are numbered. */
  it('reads a SubRip file, whose times use a comma and whose cues are numbered', () => {
    const cues = parseSubtitles(
      ['1', '00:00:01,000 --> 00:00:04,000', 'Hello.', '', '2', '00:00:05,000 --> 00:00:06,000', 'Goodbye.'].join('\n'),
    );

    expect(cues).toEqual([
      { start: 1, end: 4, text: 'Hello.' },
      { start: 5, end: 6, text: 'Goodbye.' },
    ]);
  });

  /** WebVTT allows the hours to be left off altogether. */
  it('reads the short timestamp form, with no hours', () => {
    expect(parseSubtitles(['WEBVTT', '', '01:30.000 --> 01:31.500', 'Quick.'].join('\n'))).toEqual([
      { start: 90, end: 91.5, text: 'Quick.' },
    ]);
  });

  it('keeps a cue’s own line breaks, which are how a two-line subtitle is written', () => {
    expect(
      parseSubtitles(['WEBVTT', '', '00:00:01.000 --> 00:00:02.000', 'First line', 'second line'].join('\n')),
    ).toEqual([{ start: 1, end: 2, text: 'First line\nsecond line' }]);
  });

  it('ignores a cue identifier on its own line before the times', () => {
    expect(
      parseSubtitles(['WEBVTT', '', 'intro-line', '00:00:01.000 --> 00:00:02.000', 'Hello.'].join('\n')),
    ).toEqual([{ start: 1, end: 2, text: 'Hello.' }]);
  });

  it('ignores the cue settings a file may put after the times', () => {
    expect(
      parseSubtitles(
        ['WEBVTT', '', '00:00:01.000 --> 00:00:02.000 line:90% align:middle', 'Hello.'].join('\n'),
      ),
    ).toEqual([{ start: 1, end: 2, text: 'Hello.' }]);
  });

  /**
   * `NOTE`, `STYLE` and `REGION` blocks and the `X-TIMESTAMP-MAP` the Server
   * injects for an HLS transcode (`jellyfin-playback.md` §14) are all blocks
   * with no times in them.
   */
  it('skips the blocks that are not cues, including the Server’s timestamp map', () => {
    const cues = parseSubtitles(
      [
        'WEBVTT',
        'X-TIMESTAMP-MAP=MPEGTS:900000,LOCAL:00:00:00.000',
        '',
        'NOTE this file was converted',
        '',
        'STYLE',
        '::cue { color: yellow }',
        '',
        '00:00:01.000 --> 00:00:02.000',
        'Hello.',
      ].join('\n'),
    );

    expect(cues).toEqual([{ start: 1, end: 2, text: 'Hello.' }]);
  });

  it('puts cues in time order however the file listed them', () => {
    const cues = parseSubtitles(
      [
        'WEBVTT',
        '',
        '00:00:09.000 --> 00:00:10.000',
        'Later.',
        '',
        '00:00:01.000 --> 00:00:02.000',
        'Sooner.',
      ].join('\n'),
    );

    expect(cues.map((cue) => cue.text)).toEqual(['Sooner.', 'Later.']);
  });

  it('copes with the carriage returns a file written on Windows carries', () => {
    expect(parseSubtitles('WEBVTT\r\n\r\n00:00:01.000 --> 00:00:02.000\r\nHello.\r\n')).toEqual([
      { start: 1, end: 2, text: 'Hello.' },
    ]);
  });

  it('leaves out a cue with no text and one whose times make no sense', () => {
    const cues = parseSubtitles(
      [
        'WEBVTT',
        '',
        '00:00:01.000 --> 00:00:02.000',
        '',
        '00:00:09.000 --> 00:00:03.000',
        'Backwards.',
        '',
        '00:00:04.000 --> 00:00:05.000',
        'Kept.',
      ].join('\n'),
    );

    expect(cues).toEqual([{ start: 4, end: 5, text: 'Kept.' }]);
  });

  it('has no cues for a file the Server sent nothing useful for', () => {
    expect(parseSubtitles('')).toEqual([]);
    expect(parseSubtitles('WEBVTT\n')).toEqual([]);
    // A graphical track fetched as text: binary, and nothing to draw from it.
    expect(parseSubtitles('\u0000\u0001PGS\u0000')).toEqual([]);
  });

  /**
   * A subtitle file is untrusted input out of a media library, and
   * `docs/research/player-subtitles.md` §6c names this as a genuine XSS vector:
   * `cue.text` is raw WebVTT markup. The engine hands back **plain text**, so
   * what the overlay draws can never be markup whatever it does with it, and
   * #29 (Styled subtitles) is where a known tag set earns its way back in.
   */
  describe('the markup inside a cue, which is untrusted', () => {
    it('strips the formatting tags a subtitle file may carry', () => {
      expect(
        parseSubtitles(
          ['WEBVTT', '', '00:00:01.000 --> 00:00:02.000', '<b>Bold</b> and <i>italic</i>.'].join('\n'),
        ),
      ).toEqual([{ start: 1, end: 2, text: 'Bold and italic.' }]);
    });

    it('strips a voice span and a class span, keeping what was said', () => {
      expect(
        parseSubtitles(
          ['WEBVTT', '', '00:00:01.000 --> 00:00:02.000', '<v Louise>Come with me.</v>'].join('\n'),
        ),
      ).toEqual([{ start: 1, end: 2, text: 'Come with me.' }]);
    });

    it('leaves nothing a browser would run, whatever the file says', () => {
      const cues = parseSubtitles(
        [
          'WEBVTT',
          '',
          '00:00:01.000 --> 00:00:02.000',
          '<script>alert(1)</script><img src=x onerror=alert(1)>Watch out.',
        ].join('\n'),
      );

      expect(cues[0]?.text).toBe('alert(1)Watch out.');
    });

    it('turns the character references WebVTT allows back into characters', () => {
      expect(
        parseSubtitles(
          ['WEBVTT', '', '00:00:01.000 --> 00:00:02.000', 'Salt &amp; pepper &lt;here&gt;'].join('\n'),
        ),
      ).toEqual([{ start: 1, end: 2, text: 'Salt & pepper <here>' }]);
    });
  });
});

/**
 * Which cues are on the screen at a moment. A cue is shown from its start up
 * to but not including its end, so two cues meeting at one second never both
 * appear on the frame they meet.
 */
describe('which cues belong on the screen', () => {
  const cues = parseSubtitles(
    [
      'WEBVTT',
      '',
      '00:00:01.000 --> 00:00:03.000',
      'First.',
      '',
      '00:00:05.000 --> 00:00:07.000',
      'Second.',
      '',
      '00:00:06.000 --> 00:00:08.000',
      'Overlapping.',
    ].join('\n'),
  );

  function textAt(seconds: number): string {
    return createCueCursor(cues).at(seconds).map((cue) => cue.text).join('\n');
  }

  it('shows nothing before the first cue and after the last', () => {
    expect(textAt(0)).toBe('');
    expect(textAt(4)).toBe('');
    expect(textAt(99)).toBe('');
  });

  it('shows a cue from its start, and not from a moment before it', () => {
    expect(textAt(0.999)).toBe('');
    expect(textAt(1)).toBe('First.');
    expect(textAt(2.5)).toBe('First.');
  });

  it('stops showing a cue at its end rather than one moment after it', () => {
    expect(textAt(2.999)).toBe('First.');
    expect(textAt(3)).toBe('');
  });

  it('shows both of two cues that overlap, in time order', () => {
    expect(textAt(6.5)).toBe('Second.\nOverlapping.');
  });

  /**
   * The cursor is what makes this cheap on a long film, and its state is the
   * thing that can go wrong: a User seeking backwards is the case a forward-only
   * index gets wrong, and it is one arrow-key press away in this player.
   */
  describe('the cursor, moving through a film', () => {
    it('follows playback forwards one frame at a time', () => {
      const cursor = createCueCursor(cues);
      expect(cursor.at(0.5).length).toBe(0);
      expect(cursor.at(1.5).map((cue) => cue.text)).toEqual(['First.']);
      expect(cursor.at(4).length).toBe(0);
      expect(cursor.at(6.5).map((cue) => cue.text)).toEqual(['Second.', 'Overlapping.']);
      expect(cursor.at(9).length).toBe(0);
    });

    it('answers the same whether the User arrived by playing or by seeking back', () => {
      const cursor = createCueCursor(cues);
      cursor.at(7.5);
      expect(cursor.at(2).map((cue) => cue.text)).toEqual(['First.']);
      cursor.at(99);
      expect(cursor.at(1).map((cue) => cue.text)).toEqual(['First.']);
    });

    it('copes with a position a media element reported badly', () => {
      const cursor = createCueCursor(cues);
      expect(cursor.at(Number.NaN).length).toBe(0);
      expect(cursor.at(-5).length).toBe(0);
      expect(cursor.at(Number.POSITIVE_INFINITY).length).toBe(0);
      // And it is still usable afterwards.
      expect(cursor.at(1.5).map((cue) => cue.text)).toEqual(['First.']);
    });

    it('has nothing to show for a track with no cues at all', () => {
      expect(createCueCursor([]).at(5)).toEqual([]);
    });
  });
});
