import type { SubtitleCapabilities } from '../device/types';
import type { MediaSourceInfo } from '../jellyfin/gateway';
import { isStyledSubtitleCodec } from './ass';
import { imageSubtitleFormatOf, type SubtitleTrack } from './media-tracks';

/**
 * How a subtitle track is going to be drawn on **this** device (#29).
 *
 * One decision, asked once, so the overlay and the renderer loader cannot
 * disagree about it. Story 104: styled subtitles are drawn "with their styling
 * where my device can handle it, and as plain text otherwise", and what the
 * device can handle is the device layer's to say — `subtitleCapabilities()`,
 * never a user-agent test or a `typeof OffscreenCanvas` at a call site, which
 * is the rule `src/device/` exists to hold.
 *
 * `canRenderStyled` is the capability, and **which** renderer satisfies it is
 * deliberately not decided here: `decisions.md` §8 puts JASSUB on the web and
 * libass-wasm on the TV, and the device layer's own comment says the choice is
 * "settled where it is loaded, not here". So this module answers *whether*
 * styling is drawn, and `ass-renderer.ts` answers *with what*.
 */

/**
 * Which file is fetched, as the extension the Server converts by (§14).
 *
 * `sup` is the odd one out and is not a conversion at all: the Server refuses
 * to parse or rewrite a graphical track and hands the raw file over whatever
 * extension is asked for, so asking for the honest one is the only way the
 * response's content type matches what arrives.
 */
export type SubtitleFormat = 'vtt' | 'ass' | 'sup';

export type SubtitlePresentation = {
  /**
   * - `styled` — handed whole to the renderer, which draws the file's own
   *   fonts, colours and positions.
   * - `cues` — parsed into cues and drawn by the overlay, which is #27's path
   *   and the one #28's offset is a subtraction on.
   * - `image` — a bitmap this device can decode, drawn on a canvas of its own
   *   (#30). The offset still applies: the renderer takes one.
   * - `burned-in` — a bitmap nothing here can decode, so the **Server** draws
   *   it into the picture (#30). Nothing is fetched and nothing can be
   *   shifted, which is what the Subtitle timing panel has to say out loud.
   * - `none` — a device that cannot draw subtitles at all.
   */
  readonly draw: 'styled' | 'cues' | 'image' | 'burned-in' | 'none';
  /** Absent when this app fetches nothing: burned in, or nothing drawn. */
  readonly format?: SubtitleFormat;
};

export function subtitlePresentationFor(options: {
  readonly track: SubtitleTrack;
  readonly capabilities: SubtitleCapabilities;
}): SubtitlePresentation {
  const { track, capabilities } = options;

  /**
   * A bitmap (#30), and the only question is who draws it.
   *
   * **PGS is the one family with a client-side renderer**, which is the
   * finding recorded on #30: `libpgs` decodes it, and there is no maintained
   * VobSub or DVB renderer at all — nor could there be one that worked here,
   * because Jellyfin's graphical passthrough hands over a raw PGS payload and
   * never a VobSub `.idx`, so a renderer would have the bitmaps and no
   * palette. Those two are therefore burned in on every device there is.
   *
   * Drawing it here rather than letting the Server burn it in is worth the
   * trouble for the same reason text is: a burned-in track is a transcode the
   * Server pays for, it cannot be turned off without re-negotiating, and the
   * Subtitle Offset (#28) cannot touch it. `libpgs` takes a `timeOffset`, so
   * the one drawn here keeps all three.
   */
  if (track.kind === 'image') {
    const family = imageSubtitleFormatOf(track.codec);
    if (family === 'pgs' && capabilities.canRenderImage) {
      return { draw: 'image', format: 'sup' };
    }
    // No format: nothing is fetched, because the words arrive in the picture.
    return { draw: 'burned-in' };
  }
  // Nothing can be drawn at all. The browser layer answers `true` always and
  // the comment there says why, so this is the webOS port's room rather than a
  // case that happens today.
  if (!capabilities.canRenderText) return { draw: 'none' };

  if (!isStyledSubtitleCodec(track.codec)) return { draw: 'cues', format: 'vtt' };

  /**
   * **The styled file is asked for either way**, which is the one surprise in
   * here. The Server would convert ASS to WebVTT if asked (§14), so the
   * flattening could have been left to it — two reasons it is not:
   *
   * - **One flattener gives one answer.** Otherwise the same file reads one
   *   way on a TV, where the Server flattened it, and another on a desktop
   *   whose renderer failed to load, where this app did. A Subtitle Offset is
   *   remembered per subtitle *file* (#28, story 102) and would then be
   *   remembered against two different sets of cue times.
   * - **`subtitle-cues.ts` strips `<markup>`, not `{\overrides}`.** Anything
   *   ASS-shaped the Server carried into its WebVTT would be drawn at a User
   *   verbatim. `flattenAss` is the only thing here that knows that language.
   */
  return { draw: capabilities.canRenderStyled ? 'styled' : 'cues', format: 'ass' };
}

/**
 * One font a styled file is meant to be drawn with, muxed into the file beside
 * the video. The index is what fetches it; the name is for diagnosis.
 */
export type EmbeddedFont = {
  /** `MediaAttachment.Index`: what the Attachments URL is built from. */
  readonly index: number;
  readonly fileName?: string;
};

/**
 * The font attachments of a media source (#29's "embedded fonts handled").
 *
 * An ASS file names its typefaces by name — `Style: Default,Gandhi Sans,…` —
 * and the file itself is what carries them, muxed in as attachments beside the
 * video. Without them libass falls back to whatever the device happens to
 * have, which on a TV is approximately nothing, so a carefully typeset sign is
 * drawn in the wrong face at the wrong size. Handing the renderer their URLs
 * is the whole of handling them: it fetches them itself, in its worker.
 *
 * **What counts as a font is asked three ways**, because a real Server answers
 * inconsistently: `Codec` is ffprobe's name for the attachment stream (`ttf`,
 * `otf`), `MimeType` is often left null altogether, and a TrueType collection
 * has no codec name at all — so the file's extension is the backstop. Being
 * generous is the cheap direction: a non-font handed to libass is ignored,
 * while a font left out is a sign drawn wrong.
 */
export function embeddedFontsOf(source: MediaSourceInfo): readonly EmbeddedFont[] {
  const fonts: EmbeddedFont[] = [];
  for (const attachment of source.MediaAttachments ?? []) {
    // An attachment with no index cannot be addressed, so it cannot be offered.
    if (typeof attachment.Index !== 'number') continue;
    if (!looksLikeFont(attachment)) continue;
    fonts.push({
      index: attachment.Index,
      ...(typeof attachment.FileName === 'string' && attachment.FileName !== ''
        ? { fileName: attachment.FileName }
        : {}),
    });
  }
  return fonts;
}

const FONT_CODECS: readonly string[] = ['ttf', 'otf', 'woff', 'woff2', 'ttc', 'otc', 'pfb'];
const FONT_EXTENSIONS = /\.(ttf|otf|ttc|otc|woff2?|pfb|pfm|fon)$/i;

function looksLikeFont(attachment: {
  Codec?: string | null;
  MimeType?: string | null;
  FileName?: string | null;
}): boolean {
  const codec = (attachment.Codec ?? '').toLowerCase();
  if (FONT_CODECS.includes(codec)) return true;
  const mime = (attachment.MimeType ?? '').toLowerCase();
  // `font/sfnt`, `application/x-truetype-font`, `application/vnd.ms-opentype`:
  // every spelling a Server has used has one of these two words in it.
  if (mime.includes('font') || mime.includes('opentype')) return true;
  return FONT_EXTENSIONS.test(attachment.FileName ?? '');
}
