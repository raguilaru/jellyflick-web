import { describe, expect, it } from 'vitest';
import { CAPABILITY_PROFILES } from '../device/profiles';
import type { MediaSourceInfo } from '../../src/jellyfin/gateway';
import type { SubtitleTrack } from '../../src/playback/media-tracks';
import { embeddedFontsOf, subtitlePresentationFor } from '../../src/playback/styled-subtitles';

/**
 * How a subtitle track is going to be drawn (#29), decided per device.
 *
 * The ticket asks for Vitest over "choosing a renderer per capability
 * profile", and this is it: a pure function of the track and the device
 * layer's `subtitleCapabilities()`, asked once so the answer is in one place
 * rather than in the overlay and again in the loader.
 *
 * The profiles come from `test/device/profiles.ts` rather than being written
 * out here, deliberately — `webos-5-like` is the Chromium 68 floor and is the
 * reason the flattened path exists at all, so a test that invented its own
 * capability object could go on passing after the real profile had changed
 * underneath it.
 */

function subtitleTrack(over: Partial<SubtitleTrack> = {}): SubtitleTrack {
  return {
    index: 3,
    kind: 'text',
    isDefault: false,
    isForced: false,
    ...over,
  };
}

const DESKTOP = CAPABILITY_PROFILES['modern-desktop-browser'].subtitles;
const PHONE = CAPABILITY_PROFILES['phone-safari'].subtitles;
const TV = CAPABILITY_PROFILES['webos-5-like'].subtitles;

describe('choosing how a subtitle track is drawn', () => {
  /**
   * The common case, and the one #27 built: a plain-text track is fetched as
   * WebVTT and drawn from cues, on every device there is.
   */
  it('draws a plain-text track from cues, asking the Server for WebVTT', () => {
    for (const capabilities of [DESKTOP, PHONE, TV]) {
      expect(subtitlePresentationFor({ track: subtitleTrack({ codec: 'subrip' }), capabilities })).toEqual({
        draw: 'cues',
        format: 'vtt',
      });
    }
  });

  it('draws a styled track with its styling where the device can', () => {
    for (const capabilities of [DESKTOP, PHONE]) {
      expect(subtitlePresentationFor({ track: subtitleTrack({ codec: 'ass' }), capabilities })).toEqual({
        draw: 'styled',
        format: 'ass',
      });
    }
  });

  it('counts SSA as styled too, which is the same renderer’s format', () => {
    expect(subtitlePresentationFor({ track: subtitleTrack({ codec: 'ssa' }), capabilities: DESKTOP })).toEqual({
      draw: 'styled',
      format: 'ass',
    });
  });

  /** The Chromium 68 floor: the words and the timing, drawn as cues. */
  it('flattens a styled track on a device that cannot draw the styling', () => {
    expect(subtitlePresentationFor({ track: subtitleTrack({ codec: 'ass' }), capabilities: TV })).toEqual({
      draw: 'cues',
      format: 'ass',
    });
  });

  /**
   * **The file asked for is the styled one either way**, which is the one
   * surprise in here and is deliberate. The Server would convert ASS to WebVTT
   * if asked (`jellyfin-playback.md` §14), so flattening could have been left
   * to it — but then the same file would read one way on a TV and another on a
   * desktop whose renderer failed to load, and `subtitle-cues.ts` strips
   * `<markup>` rather than ASS's `{\override}` braces, so anything the Server
   * carried over would be drawn at a User verbatim. One flattener gives one
   * answer everywhere.
   */
  it('asks for the styled file even when it is going to be flattened', () => {
    expect(
      subtitlePresentationFor({ track: subtitleTrack({ codec: 'ass' }), capabilities: TV }).format,
    ).toBe('ass');
  });

  /** #30's territory: a bitmap needs a decoder this app does not have yet. */
  it('draws nothing for an image track, which is #30’s to render', () => {
    expect(
      subtitlePresentationFor({
        track: subtitleTrack({ kind: 'image', codec: 'pgssub' }),
        capabilities: DESKTOP,
      }),
    ).toEqual({ draw: 'none', format: 'vtt' });
  });

  /**
   * A codec the Server did not name is read as plain text, which is what
   * `media-tracks.ts` already does with it and the one this app can try.
   */
  it('treats a track whose codec the Server did not name as plain text', () => {
    expect(subtitlePresentationFor({ track: subtitleTrack(), capabilities: DESKTOP })).toEqual({
      draw: 'cues',
      format: 'vtt',
    });
  });
});

/**
 * The fonts a styled file is drawn with (#29's "embedded fonts handled").
 *
 * An ASS file names its typefaces by name — `Style: Default,Gandhi Sans,…` —
 * and a library's own files are the ones carrying them, muxed in beside the
 * video as attachments. Without them libass falls back to whatever the device
 * has, which on a TV is approximately nothing, and a carefully typeset sign
 * comes out in the wrong face at the wrong size. So the attachments are read
 * off the media source and handed to the renderer.
 *
 * The selector is pure and the *fetching* is the renderer's, which is what
 * makes this testable without a WASM binary in the room.
 */
describe('the embedded fonts a styled file is drawn with', () => {
  const sourceWith = (attachments: MediaSourceInfo['MediaAttachments']): MediaSourceInfo => ({
    Id: 'source-1',
    MediaAttachments: attachments,
  });

  it('picks out the font attachments, by index and file name', () => {
    expect(
      embeddedFontsOf(
        sourceWith([
          { Index: 0, Codec: 'ttf', FileName: 'Gandhi-Sans.ttf', MimeType: 'application/x-truetype-font' },
          { Index: 1, Codec: 'otf', FileName: 'Sign-Display.otf' },
        ]),
      ),
    ).toEqual([
      { index: 0, fileName: 'Gandhi-Sans.ttf' },
      { index: 1, fileName: 'Sign-Display.otf' },
    ]);
  });

  /**
   * An attachment is not always a font: a Server will happily carry a cover
   * image or a chapter file in the same list, and handing one to libass as a
   * typeface achieves nothing.
   */
  it('leaves an attachment that is not a font out', () => {
    expect(
      embeddedFontsOf(
        sourceWith([
          { Index: 0, Codec: 'mjpeg', FileName: 'cover.jpg', MimeType: 'image/jpeg' },
          { Index: 1, Codec: 'ttf', FileName: 'Gandhi-Sans.ttf' },
        ]),
      ),
    ).toEqual([{ index: 1, fileName: 'Gandhi-Sans.ttf' }]);
  });

  /**
   * Jellyfin leaves `MimeType` null on plenty of real attachments, so the file
   * name has to be enough on its own — and `ttc`, a TrueType collection, is a
   * font the Server has no codec name for.
   */
  it('reads the file name when the Server named neither codec nor type', () => {
    expect(embeddedFontsOf(sourceWith([{ Index: 4, FileName: 'Mixed.TTC' }]))).toEqual([
      { index: 4, fileName: 'Mixed.TTC' },
    ]);
  });

  it('answers none when the Server sent no attachments at all', () => {
    expect(embeddedFontsOf(sourceWith([]))).toEqual([]);
    expect(embeddedFontsOf({ Id: 'source-1' })).toEqual([]);
  });

  /** An attachment with no index cannot be fetched, so it is not offered. */
  it('leaves out an attachment the Server gave no index', () => {
    expect(embeddedFontsOf(sourceWith([{ Codec: 'ttf', FileName: 'Nameless.ttf' }]))).toEqual([]);
  });
});
