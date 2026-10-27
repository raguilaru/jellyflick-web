import { describe, expect, it } from 'vitest';
import type { MediaSourceInfo } from '../../src/jellyfin/gateway';
import { imageSubtitleFormatOf, tracksOf } from '../../src/playback/media-tracks';

/**
 * A media source's `MediaStreams` read as the two lists the track picker shows
 * (#27).
 *
 * The expected values here come from `docs/research/jellyfin-playback.md` §14,
 * which quotes the Server's **own** classification predicates out of
 * `MediaBrowser.Model/Entities/MediaStream.cs`. They are not recomputed the way
 * the code computes them: the two traps in that section — `microdvd` being text
 * despite its `.sub` extension, and a bare `sub` being image-based — are the
 * reason this is a table rather than a sentence.
 */

function sourceWith(streams: Record<string, unknown>[]): MediaSourceInfo {
  return { Id: 'source-1', MediaStreams: streams } as MediaSourceInfo;
}

describe('the tracks of a media source', () => {
  it('reads the audio and subtitle streams as two lists, leaving the video out', () => {
    const tracks = tracksOf(
      sourceWith([
        { Index: 0, Type: 'Video', Codec: 'vp9' },
        { Index: 1, Type: 'Audio', Language: 'eng', DisplayTitle: 'English' },
        { Index: 2, Type: 'Audio', Language: 'fra', DisplayTitle: 'French' },
        { Index: 3, Type: 'Subtitle', Language: 'eng', Codec: 'subrip', DisplayTitle: 'English' },
      ]),
    );

    expect(tracks.audio.map((track) => track.index)).toEqual([1, 2]);
    expect(tracks.audio.map((track) => track.language)).toEqual(['eng', 'fra']);
    expect(tracks.subtitles.map((track) => track.index)).toEqual([3]);
  });

  /**
   * The index is the stream's **own** `Index`, which is what
   * `AudioStreamIndex` and `SubtitleStreamIndex` mean on the wire. An external
   * subtitle file is appended to the list, so its index is not its position in
   * it — reading the position instead would ask the Server for the wrong track.
   */
  it('keeps each stream’s own index rather than its place in the list', () => {
    const tracks = tracksOf(
      sourceWith([
        { Index: 0, Type: 'Video' },
        { Index: 1, Type: 'Audio', Language: 'eng' },
        { Index: 7, Type: 'Subtitle', Language: 'spa', Codec: 'subrip', IsExternal: true },
      ]),
    );

    expect(tracks.subtitles[0]?.index).toBe(7);
  });

  it('says which track the Server marked as this file’s own default, and which is forced', () => {
    const tracks = tracksOf(
      sourceWith([
        { Index: 1, Type: 'Audio', Language: 'eng' },
        { Index: 2, Type: 'Audio', Language: 'jpn', IsDefault: true },
        { Index: 3, Type: 'Subtitle', Codec: 'subrip', Language: 'eng', IsForced: true },
      ]),
    );

    expect(tracks.audio.map((track) => track.isDefault)).toEqual([false, true]);
    expect(tracks.subtitles[0]?.isForced).toBe(true);
  });

  /**
   * The seam #29 (Styled subtitles) and #30 (Image subtitles) take over: this
   * ticket draws `text`, and those two grow a renderer for `image` and for the
   * ASS codecs without this classification moving.
   */
  describe('text or image, which is the Server’s own predicate', () => {
    const textCodecs = ['subrip', 'srt', 'ass', 'ssa', 'mov_text', 'webvtt', 'microdvd'];
    const imageCodecs = ['pgssub', 'hdmv_pgs_subtitle', 'sup', 'dvdsub', 'dvd_subtitle', 'vobsub', 'dvbsub', 'dvb_subtitle', 'sub'];

    for (const codec of textCodecs) {
      it(`reads ${codec} as text, which this app draws itself`, () => {
        const tracks = tracksOf(sourceWith([{ Index: 1, Type: 'Subtitle', Codec: codec }]));
        expect(tracks.subtitles[0]?.kind).toBe('text');
      });
    }

    for (const codec of imageCodecs) {
      it(`reads ${codec} as an image, which it does not`, () => {
        const tracks = tracksOf(sourceWith([{ Index: 1, Type: 'Subtitle', Codec: codec }]));
        expect(tracks.subtitles[0]?.kind).toBe('image');
      });
    }
  });

  /**
   * **Which** bitmap, which is #30's question rather than #27's. `kind` says
   * only that a track is a picture; whether this app can draw it depends on
   * the family, because PGS has a client-side renderer and VobSub and DVB have
   * none (the finding recorded on #30). The expected values are §14's own
   * table of codec names, not a restatement of the regular expressions.
   */
  describe('which bitmap family an image track is', () => {
    const pgsCodecs = ['pgssub', 'hdmv_pgs_subtitle', 'sup', 'PGSSUB'];
    const vobSubCodecs = ['dvdsub', 'dvd_subtitle', 'vobsub', 'sub'];
    const dvbCodecs = ['dvbsub', 'dvb_subtitle'];

    for (const codec of pgsCodecs) {
      it(`reads ${codec} as PGS, the one family a renderer exists for`, () => {
        expect(imageSubtitleFormatOf(codec)).toBe('pgs');
      });
    }

    for (const codec of vobSubCodecs) {
      it(`reads ${codec} as VobSub, which is always burned in`, () => {
        expect(imageSubtitleFormatOf(codec)).toBe('vobsub');
      });
    }

    for (const codec of dvbCodecs) {
      it(`reads ${codec} as DVB, which is always burned in`, () => {
        expect(imageSubtitleFormatOf(codec)).toBe('dvb');
      });
    }

    it('reads a text codec as no bitmap family at all', () => {
      expect(imageSubtitleFormatOf('subrip')).toBeUndefined();
      // The trap §14 names: a `.sub` extension on a text format.
      expect(imageSubtitleFormatOf('microdvd')).toBeUndefined();
      expect(imageSubtitleFormatOf(undefined)).toBeUndefined();
    });
  });

  it('has no tracks at all for a source the Server sent no streams for', () => {
    expect(tracksOf({ Id: 'source-1' } as MediaSourceInfo)).toEqual({ audio: [], subtitles: [] });
  });
});
