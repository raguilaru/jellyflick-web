import { thumbnailAt, type TrickplayResolution } from './trickplay';

/**
 * The thumbnail over the seek bar (#32, story 90).
 *
 * It draws and nothing else: which thumbnail a moment is and how big the box
 * must be are `trickplay.ts`'s, and whether there is anything to draw at all
 * was settled by the player before this component existed. So a Server with no
 * thumbnails never reaches here, and this file has no empty state.
 *
 * **A box with a background, not an `<img>`.** One tile image holds a whole
 * sheet of thumbnails — `TileWidth x TileHeight` of them — so the browser
 * fetches each sheet once and every thumbnail in it is a change of
 * `background-position`. An `<img>` per thumbnail would re-request the same
 * sheet for each.
 *
 * **`aria-hidden`.** The bar already announces where it is, in words, through
 * `aria-valuetext`; a picture of a frame says nothing a screen reader can read
 * out, and a second announcement of the same number on every pointer move
 * would be noise. It is a sighted aid, and it says so.
 */

/** How wide the preview is drawn at most. Narrow enough for a 375px screen. */
export const PREVIEW_MAX_WIDTH = 240;

export type TrickplayPreviewProps = {
  resolution: TrickplayResolution;
  /** The address of one **tile image**, by its index. */
  tileUrl: (tileIndex: number) => string;
  /** The moment being previewed, in seconds. */
  positionSeconds: number;
  /**
   * Where along the bar to sit, in pixels from its left edge, already clamped
   * by the controls so the preview cannot hang off either end of the bar —
   * and so the document can never grow wider than the screen (#44's lesson).
   */
  left: number;
};

export function TrickplayPreview({
  resolution,
  tileUrl,
  positionSeconds,
  left,
}: TrickplayPreviewProps) {
  const thumbnail = thumbnailAt(resolution, positionSeconds, PREVIEW_MAX_WIDTH);
  if (thumbnail === undefined) return null;

  const style = [
    `left: ${String(Math.round(left))}px`,
    `width: ${String(Math.round(thumbnail.width))}px`,
    `height: ${String(Math.round(thumbnail.height))}px`,
    `background-image: url("${tileUrl(thumbnail.tileIndex)}")`,
    `background-size: ${String(Math.round(thumbnail.backgroundWidth))}px ${String(
      Math.round(thumbnail.backgroundHeight),
    )}px`,
    `background-position: ${String(Math.round(thumbnail.offsetX))}px ${String(
      Math.round(thumbnail.offsetY),
    )}px`,
  ].join('; ');

  return <div class="player__preview" aria-hidden="true" style={style} />;
}
