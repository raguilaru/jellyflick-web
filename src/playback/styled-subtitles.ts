import type { SubtitleCapabilities } from '../device/types';
import { isStyledSubtitleCodec } from './ass';
import type { SubtitleTrack } from './media-tracks';

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

/** Which file is fetched, as the extension the Server converts by (§14). */
export type SubtitleFormat = 'vtt' | 'ass';

export type SubtitlePresentation = {
  /**
   * - `styled` — handed whole to the renderer, which draws the file's own
   *   fonts, colours and positions.
   * - `cues` — parsed into cues and drawn by the overlay, which is #27's path
   *   and the one #28's offset is a subtraction on.
   * - `none` — nothing this app can draw. A bitmap, which is #30's.
   */
  readonly draw: 'styled' | 'cues' | 'none';
  readonly format: SubtitleFormat;
};

export function subtitlePresentationFor(options: {
  readonly track: SubtitleTrack;
  readonly capabilities: SubtitleCapabilities;
}): SubtitlePresentation {
  const { track, capabilities } = options;

  // A bitmap, which needs a decoder this app does not have until #30. The
  // picker already says so rather than hiding the track (#27).
  if (track.kind === 'image') return { draw: 'none', format: 'vtt' };
  // Nothing can be drawn at all. The browser layer answers `true` always and
  // the comment there says why, so this is the webOS port's room rather than a
  // case that happens today.
  if (!capabilities.canRenderText) return { draw: 'none', format: 'vtt' };

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
