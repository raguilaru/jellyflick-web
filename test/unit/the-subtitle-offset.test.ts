import { describe, expect, it } from 'vitest';
import {
  MAX_SUBTITLE_OFFSET_SECONDS,
  offsetToSyncToLine,
  parseSubtitleOffsets,
  serialiseSubtitleOffsets,
  shiftSubtitleOffset,
  STORED_SUBTITLE_OFFSET_LIMIT,
  subtitleFileOf,
  subtitleOffsetFor,
  SUBTITLE_OFFSET_STEP_SECONDS,
  withSubtitleOffset,
} from '../../src/playback/subtitle-offset';
import type { SubtitleCue } from '../../src/playback/subtitle-cues';
import type { SubtitleTrack } from '../../src/playback/media-tracks';

/**
 * The Subtitle Offset (#28): the arithmetic, which line "Sync to this line"
 * syncs to, and how an offset is remembered per subtitle file.
 *
 * Every expected number here is a **literal**, never one worked out the way the
 * code works it out: a test that added `0.1` itself would agree with a bug in
 * the rounding rather than catch it, and that rounding is the whole reason the
 * rule exists — `0.1 + 0.2` is `0.30000000000000004` in this language.
 *
 * The sign convention is the one the readout says out loud: a **positive**
 * offset means the subtitles come **later** than the picture, which is the
 * common complaint a User opens this panel to fix.
 */

/** A track as `media-tracks.ts` hands one over. */
function track(fields: Partial<SubtitleTrack> = {}): SubtitleTrack {
  return { index: 3, kind: 'text', isDefault: false, isForced: false, ...fields };
}

function cue(start: number, end: number, text: string): SubtitleCue {
  return { start, end, text };
}

describe('shifting the subtitles by a step', () => {
  it('shifts by a tenth of a second, which is the step the panel offers', () => {
    expect(SUBTITLE_OFFSET_STEP_SECONDS).toBe(0.1);
    expect(shiftSubtitleOffset(0, 1)).toBe(0.1);
    expect(shiftSubtitleOffset(0, -1)).toBe(-0.1);
  });

  /**
   * The reason the offset is rounded at every step rather than only when it is
   * drawn: three tenths added one at a time is `0.30000000000000004` in binary
   * floating point, and a readout built from that says so.
   */
  it('stays on the tenth-of-a-second grid however many steps are taken', () => {
    expect(shiftSubtitleOffset(shiftSubtitleOffset(shiftSubtitleOffset(0, 1), 1), 1)).toBe(0.3);
    expect(shiftSubtitleOffset(0.7, 1)).toBe(0.8);
    expect(shiftSubtitleOffset(-0.1, -1)).toBe(-0.2);
  });

  /** Holding a button repeats faster, which is several steps in one call. */
  it('takes several steps at once, for a button being held down', () => {
    expect(shiftSubtitleOffset(0, 8)).toBe(0.8);
    expect(shiftSubtitleOffset(1, -4)).toBe(0.6);
  });

  /**
   * A held button on a remote can repeat for a long time, and an offset of
   * twenty minutes is not a mistake a User can see their way out of — the
   * subtitles are simply gone. The clamp is what keeps Reset from being the
   * only way back.
   */
  it('stops at the ends rather than running away with a held button', () => {
    expect(MAX_SUBTITLE_OFFSET_SECONDS).toBe(30);
    expect(shiftSubtitleOffset(29.9, 5)).toBe(30);
    expect(shiftSubtitleOffset(-29.9, -5)).toBe(-30);
  });

  /** A moment the element could not report is no reason to lose the offset. */
  it('reads an unusable offset as none at all', () => {
    expect(shiftSubtitleOffset(Number.NaN, 1)).toBe(0.1);
    expect(shiftSubtitleOffset(Number.POSITIVE_INFINITY, -1)).toBe(-0.1);
  });
});

/**
 * "Sync to this line" (story 100): the User presses it the moment they *hear*
 * the line that is on the screen, so the line on the screen has to start at
 * that moment. The new offset is therefore the distance between where the
 * picture is and where that cue starts in the file — and it does not depend on
 * the offset already in force, which is what makes pressing it twice harmless.
 */
describe('syncing to the line on the screen', () => {
  const cues = [cue(10, 13, 'Where are you going?'), cue(20, 23, 'Nowhere.')];

  it('shifts the subtitles later when the line is heard after it was drawn', () => {
    // The first cue starts at 10 and is on screen at 11.4 with no offset. The
    // User hears it then, so it should have started then: 11.4 - 10 = 1.4.
    expect(offsetToSyncToLine({ cues, position: 11.4, offset: 0 })).toBe(1.4);
  });

  /**
   * The other sign, which is where a User fine-tuning a shift they have
   * already made ends up: with five seconds of earliness in force, the cue the
   * file puts at 10 is drawn from 5, and a press at 6.5 asks for 6.5 - 10.
   * A negative answer is only reachable this way round, because a cue is never
   * drawn before its own start unless the offset is already negative.
   */
  it('shifts them earlier when the line is heard before the cue starts in the file', () => {
    expect(offsetToSyncToLine({ cues, position: 6.5, offset: -5 })).toBe(-3.5);
  });

  /**
   * It reads the line that is **drawn**, so the offset already in force is
   * what decides which cue that is. Without that, a User who had already
   * shifted the subtitles would sync against a line nobody could see.
   */
  it('syncs to the line the offset in force is drawing, not the one at the raw position', () => {
    // Two seconds of lateness, so at 14 the cues are read at 12 and the line
    // on the screen is the one at 10..13. Read at 14 instead — the raw
    // position — nothing would be on the screen and this would answer nothing.
    expect(offsetToSyncToLine({ cues, position: 14, offset: 2 })).toBe(4);
    expect(offsetToSyncToLine({ cues, position: 14, offset: 0 })).toBeUndefined();
  });

  it('rounds onto the same grid the buttons step along', () => {
    // 11.37 - 10 = 1.37, which is 1.4 on the tenth-of-a-second grid.
    expect(offsetToSyncToLine({ cues, position: 11.37, offset: 0 })).toBe(1.4);
  });

  /**
   * Nothing on the screen is nothing to sync to, and inventing a line would be
   * worse than saying so: the panel offers the button only when this answers.
   */
  it('answers with nothing when no line is on the screen', () => {
    expect(offsetToSyncToLine({ cues, position: 5, offset: 0 })).toBeUndefined();
    expect(offsetToSyncToLine({ cues: [], position: 11, offset: 0 })).toBeUndefined();
    expect(offsetToSyncToLine({ cues, position: Number.NaN, offset: 0 })).toBeUndefined();
  });

  /**
   * Two cues on the screen at once is a real subtitle file — a sign over a
   * speaker's line. The one that started **last** is the line just heard.
   */
  it('syncs to the most recently started of two overlapping lines', () => {
    const overlapping = [cue(10, 16, '[a radio plays]'), cue(12, 16, 'Turn it off.')];

    expect(offsetToSyncToLine({ cues: overlapping, position: 13, offset: 0 })).toBe(1);
  });

  /** The clamp holds here too: a wild press cannot leave an unusable offset. */
  it('stops at the ends, as a held button does', () => {
    const long = [cue(0, 600, 'A very long line.')];

    expect(offsetToSyncToLine({ cues: long, position: 500, offset: 0 })).toBe(30);
  });
});

/**
 * Where an offset is remembered (story 102): per **subtitle file**, so it
 * applies on every device and to every Episode that uses the same file.
 */
describe('which subtitle file an offset belongs to', () => {
  /**
   * An external subtitle file has a path of its own on the Server, and two
   * Episodes really can share one. That is the only way story 102's "every
   * Episode that uses the same file" is reachable at all, so the path is
   * preferred wherever the Server gave one.
   */
  it('is the file’s own path on the Server, where the Server named one', () => {
    expect(
      subtitleFileOf(track({ path: '/media/Movies/Arrival/Arrival.en.srt' }), 'source-arrival'),
    ).toBe('path:/media/Movies/Arrival/Arrival.en.srt');
  });

  /**
   * A stream muxed into the video has no file of its own, so the file it lives
   * in and the stream inside it are what name it. The media source id is the
   * file; the index is the stream's own `MediaStream.Index`.
   */
  it('is the media source and the stream for a track inside the video file', () => {
    expect(subtitleFileOf(track({ index: 4 }), 'source-arrival')).toBe('stream:source-arrival:4');
  });

  it('tells two streams of one file apart, and one stream of two files', () => {
    expect(subtitleFileOf(track({ index: 3 }), 'a')).not.toBe(
      subtitleFileOf(track({ index: 4 }), 'a'),
    );
    expect(subtitleFileOf(track({ index: 3 }), 'a')).not.toBe(
      subtitleFileOf(track({ index: 3 }), 'b'),
    );
  });
});

describe('the offsets a User has stored', () => {
  it('has no offset for a file nothing was ever stored for', () => {
    expect(subtitleOffsetFor([], 'stream:source-arrival:3')).toBe(0);
    expect(
      subtitleOffsetFor([{ file: 'stream:source-arrival:3', seconds: 0.8 }], 'stream:other:1'),
    ).toBe(0);
  });

  it('reads back the offset stored for a file', () => {
    expect(
      subtitleOffsetFor(
        [{ file: 'stream:source-arrival:3', seconds: 0.8 }],
        'stream:source-arrival:3',
      ),
    ).toBe(0.8);
  });

  it('replaces the offset for a file rather than keeping both', () => {
    const stored = withSubtitleOffset([{ file: 'stream:a:3', seconds: 0.8 }], 'stream:a:3', -1.2);

    expect(stored).toEqual([{ file: 'stream:a:3', seconds: -1.2 }]);
  });

  /**
   * Reset forgets the file rather than storing a shift of nothing. A User who
   * has put a file back in sync has nothing to remember, and an entry per
   * subtitle file a household ever watched would fill one `CustomPrefs` string
   * with zeroes.
   */
  it('forgets a file the User has put back in sync', () => {
    const stored = withSubtitleOffset(
      [
        { file: 'stream:a:3', seconds: 0.8 },
        { file: 'stream:b:3', seconds: 0.4 },
      ],
      'stream:a:3',
      0,
    );

    expect(stored).toEqual([{ file: 'stream:b:3', seconds: 0.4 }]);
  });

  /**
   * `CustomPrefs` is one string per key and the Server is somebody's Raspberry
   * Pi, so the list cannot grow for ever. The newest write goes last and the
   * oldest falls off the front, which makes "the files I have been watching"
   * the ones that survive.
   */
  it('keeps the most recently adjusted files and drops the oldest', () => {
    expect(STORED_SUBTITLE_OFFSET_LIMIT).toBe(100);

    let stored = withSubtitleOffset([], 'stream:first:3', 0.5);
    for (let at = 0; at < STORED_SUBTITLE_OFFSET_LIMIT; at += 1) {
      stored = withSubtitleOffset(stored, `stream:later-${String(at)}:3`, 0.1);
    }

    expect(stored).toHaveLength(STORED_SUBTITLE_OFFSET_LIMIT);
    expect(subtitleOffsetFor(stored, 'stream:first:3')).toBe(0);
    expect(subtitleOffsetFor(stored, 'stream:later-0:3')).toBe(0.1);
  });

  it('moves a file it already held to the newest end when it is adjusted again', () => {
    const stored = withSubtitleOffset(
      [
        { file: 'stream:a:3', seconds: 0.8 },
        { file: 'stream:b:3', seconds: 0.4 },
      ],
      'stream:a:3',
      0.9,
    );

    expect(stored).toEqual([
      { file: 'stream:b:3', seconds: 0.4 },
      { file: 'stream:a:3', seconds: 0.9 },
    ]);
  });
});

describe('the one `CustomPrefs` string the offsets are stored as', () => {
  it('reads back what it wrote', () => {
    const offsets = [
      { file: 'path:/media/Movies/Arrival/Arrival.en.srt', seconds: -1.2 },
      { file: 'stream:source-arrival:4', seconds: 0.8 },
    ];

    expect(parseSubtitleOffsets(serialiseSubtitleOffsets(offsets))).toEqual(offsets);
  });

  it('reads nothing stored, and nothing readable, as no offsets at all', () => {
    expect(parseSubtitleOffsets(undefined)).toEqual([]);
    expect(parseSubtitleOffsets(null)).toEqual([]);
    expect(parseSubtitleOffsets('')).toEqual([]);
    expect(parseSubtitleOffsets('{')).toEqual([]);
    expect(parseSubtitleOffsets('{"file":"a","seconds":1}')).toEqual([]);
  });

  /**
   * A broken entry is dropped on its own rather than taking the whole list
   * with it, which is the treatment a stored Home Layout's unknown Row kind
   * gets: the worst a lost entry does is a User shifting one file again.
   */
  it('drops an entry it cannot read and keeps the rest', () => {
    const stored = JSON.stringify([
      { file: 'stream:a:3', seconds: 0.8 },
      { file: '', seconds: 1 },
      { file: 'stream:b:3' },
      { file: 'stream:c:3', seconds: 'later' },
      { file: 'stream:d:3', seconds: 900 },
      'nonsense',
      { file: 'stream:a:3', seconds: 2 },
    ]);

    expect(parseSubtitleOffsets(stored)).toEqual([
      { file: 'stream:a:3', seconds: 0.8 },
      // Clamped on the way in, so a hand-edited or newer value cannot leave a
      // User with subtitles they will never see.
      { file: 'stream:d:3', seconds: 30 },
    ]);
  });
});
