/**
 * Trickplay: the thumbnail a User sees while scrubbing (#32, story 90).
 *
 * This file is the **arithmetic and the choosing**, with no DOM in it, for the
 * same reason `scrubbing.ts` is separate from the controls that draw it: every
 * number here comes off a Server and any of them can be missing, zero or
 * nonsense. A `0` `Interval` would be a division by zero and a preview drawn
 * at `NaN` pixels; a Server that generated no thumbnails at all is the
 * ordinary case rather than an error. All of that is decided here, so the
 * component above it only ever draws a box it has been handed.
 *
 * The shapes are Jellyfin's, written out rather than imported from
 * `@jellyfin/sdk` (ADR 0001 and `decisions.md` §4), and the formula is
 * `jellyfin-playback.md` §13's.
 */

/** `TrickplayInfoDto`: one manifest, for one media source at one width. */
export type TrickplayInfo = {
  /** One thumbnail's width, and the number in the tile image's URL path. */
  readonly Width: number;
  readonly Height: number;
  /** Thumbnails per row in a tile image. */
  readonly TileWidth: number;
  /** Thumbnails per column in a tile image. */
  readonly TileHeight: number;
  /** How many thumbnails there are in all, across every tile image. */
  readonly ThumbnailCount: number;
  /** Milliseconds between one thumbnail and the next. */
  readonly Interval: number;
  readonly Bandwidth?: number;
};

/**
 * `BaseItemDto.Trickplay`, which is a map of maps: **media source id** on the
 * outside and the **thumbnail width, as a string**, on the inside. A Server
 * may have generated several widths for one source, and its `TrickplayOptions`
 * decides which; a Server with the feature switched off has none at all, which
 * is what the nullable inner map and the absent field both mean.
 */
export type TrickplayMap = Record<string, Record<string, TrickplayInfo> | null | undefined>;

/** One set of thumbnails: the width that goes in the URL, and its manifest. */
export type TrickplayResolution = {
  readonly width: number;
  readonly info: TrickplayInfo;
};

/**
 * Which set of thumbnails to use for a media source, or nothing at all.
 *
 * **The smallest the Server has that is still at least as wide as the preview
 * will be drawn**, which is §13's "the smallest available width that still
 * looks sharp"; a Server that only generated small ones falls back to the
 * widest there is rather than to nothing, because a slightly soft thumbnail is
 * the feature and no thumbnail is not.
 *
 * Nothing at all is the answer for a source the Server generated none for, for
 * a Server with trickplay switched off, and for a manifest whose numbers
 * cannot be drawn with — all three are "no previews, hide the feature", and
 * none of them is a failure a User should be told about.
 */
export function trickplayFor(
  map: TrickplayMap | undefined,
  mediaSourceId: string,
  preferredWidth: number,
): TrickplayResolution | undefined {
  const bySource = map?.[mediaSourceId];
  if (bySource === undefined || bySource === null) return undefined;

  const usable = Object.entries(bySource)
    .map(([width, info]) => ({ width: Number.parseInt(width, 10), info }))
    .filter((candidate) => Number.isFinite(candidate.width) && candidate.width > 0)
    .filter((candidate) => isDrawable(candidate.info))
    .sort((left, right) => left.width - right.width);

  if (usable.length === 0) return undefined;
  return usable.find((candidate) => candidate.width >= preferredWidth) ?? usable[usable.length - 1];
}

/**
 * Everything a preview needs to draw itself: which tile image to fetch, how
 * big the box is, and where inside the sheet the one thumbnail sits.
 *
 * It is a **box plus a background offset** rather than a cropped image,
 * because a tile image holds a hundred thumbnails and a browser should fetch
 * each sheet once for all of them.
 */
export type TrickplayThumbnail = {
  /** The **tile image's** index, which is what goes in the URL — not the thumbnail's. */
  readonly tileIndex: number;
  /** The box to draw, in CSS pixels. */
  readonly width: number;
  readonly height: number;
  /** The whole sheet's drawn size, for `background-size`. */
  readonly backgroundWidth: number;
  readonly backgroundHeight: number;
  /** Where the sheet sits behind the box, for `background-position`. Negative. */
  readonly offsetX: number;
  readonly offsetY: number;
};

/**
 * The thumbnail for a moment, drawn no wider than `maxWidth`.
 *
 * Scaled **whole**: the box, the sheet behind it and the offset into it are
 * all multiplied by one factor, so a phone draws a 320-pixel sheet at 160 and
 * the right thumbnail is still the one on the screen. It never scales *up* —
 * a preview wider than the Server's thumbnails would be a blurred enlargement
 * of something that is already small.
 *
 * A position a media element reports badly reads as the start, which is the
 * rule `scrubbing.ts` follows for every one of these numbers, and a position
 * past the last thumbnail is clamped to it: a sheet holds what it holds, and
 * asking for a tile image after the end would be a 404 behind the picture.
 */
export function thumbnailAt(
  resolution: TrickplayResolution,
  positionSeconds: number,
  maxWidth: number,
): TrickplayThumbnail | undefined {
  const { info } = resolution;
  if (!isDrawable(info)) return undefined;

  const at = Number.isFinite(positionSeconds) && positionSeconds > 0 ? positionSeconds : 0;
  const perTile = info.TileWidth * info.TileHeight;
  const thumbIndex = Math.min(info.ThumbnailCount - 1, Math.floor((at * 1000) / info.Interval));
  const within = thumbIndex % perTile;
  const column = within % info.TileWidth;
  const row = Math.floor(within / info.TileWidth);

  const scale = Math.min(1, maxWidth / info.Width);

  return {
    tileIndex: Math.floor(thumbIndex / perTile),
    width: info.Width * scale,
    height: info.Height * scale,
    backgroundWidth: info.Width * info.TileWidth * scale,
    backgroundHeight: info.Height * info.TileHeight * scale,
    offsetX: -(column * info.Width * scale),
    offsetY: -(row * info.Height * scale),
  };
}

/** Whether a manifest's numbers can be divided by and drawn with. */
function isDrawable(info: TrickplayInfo | undefined): info is TrickplayInfo {
  if (info === undefined) return false;
  return (
    positive(info.Width) &&
    positive(info.Height) &&
    positive(info.TileWidth) &&
    positive(info.TileHeight) &&
    positive(info.ThumbnailCount) &&
    positive(info.Interval)
  );
}

function positive(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}
