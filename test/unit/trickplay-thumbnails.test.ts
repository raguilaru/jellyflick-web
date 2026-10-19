import { describe, expect, it } from 'vitest';
import {
  thumbnailAt,
  trickplayFor,
  type TrickplayInfo,
  type TrickplayMap,
} from '../../src/playback/trickplay';

/**
 * The arithmetic behind the thumbnail a User sees while scrubbing (#32,
 * story 90).
 *
 * It is pure and has a file of its own for the reason `scrubbing.ts` does:
 * every number here comes off a Server and can be absent, zero or nonsense,
 * and a preview that divides by a zero `Interval` would be this file's fault
 * rather than the component's. The worked examples below are
 * `jellyfin-playback.md` §13's own formula applied by hand, not a second
 * copy of the implementation.
 */

/** 250 thumbnails, one every ten seconds, in 10 x 10 tile sheets of 320x180. */
const SHEET: TrickplayInfo = {
  Width: 320,
  Height: 180,
  TileWidth: 10,
  TileHeight: 10,
  ThumbnailCount: 250,
  Interval: 10_000,
  Bandwidth: 1_000_000,
};

const MAP: TrickplayMap = {
  'source-1': { '160': { ...SHEET, Width: 160, Height: 90 }, '320': SHEET },
};

describe('which set of thumbnails to use', () => {
  it('takes the smallest the Server has that is still as wide as the preview', () => {
    expect(trickplayFor(MAP, 'source-1', 200)?.width).toBe(320);
    expect(trickplayFor(MAP, 'source-1', 100)?.width).toBe(160);
  });

  it('falls back to the widest there is when none is wide enough', () => {
    expect(trickplayFor(MAP, 'source-1', 2000)?.width).toBe(320);
  });

  it('has nothing to offer for a source the Server generated none for', () => {
    expect(trickplayFor(MAP, 'source-2', 320)).toBeUndefined();
    expect(trickplayFor({ 'source-1': null }, 'source-1', 320)).toBeUndefined();
    expect(trickplayFor(undefined, 'source-1', 320)).toBeUndefined();
  });

  it('refuses a manifest whose numbers cannot be drawn with', () => {
    expect(trickplayFor({ a: { '320': { ...SHEET, Interval: 0 } } }, 'a', 320)).toBeUndefined();
    expect(
      trickplayFor({ a: { '320': { ...SHEET, ThumbnailCount: 0 } } }, 'a', 320),
    ).toBeUndefined();
    expect(trickplayFor({ a: { '320': { ...SHEET, TileWidth: 0 } } }, 'a', 320)).toBeUndefined();
    expect(trickplayFor({ a: { '320': { ...SHEET, Height: 0 } } }, 'a', 320)).toBeUndefined();
  });
});

describe('the thumbnail for a moment', () => {
  const resolution = { width: 320, info: SHEET };

  it('is the tile, the row and the column §13 works out', () => {
    // 125 s / 10 s = thumbnail 12; 100 to a sheet, so sheet 0, column 2, row 1.
    const at = thumbnailAt(resolution, 125, 320);
    expect(at).toEqual({
      tileIndex: 0,
      width: 320,
      height: 180,
      backgroundWidth: 3200,
      backgroundHeight: 1800,
      offsetX: -640,
      offsetY: -180,
    });
  });

  it('moves on to the next tile image when the sheet runs out', () => {
    // Thumbnail 100 is the first of the second sheet.
    expect(thumbnailAt(resolution, 1005, 320)).toMatchObject({
      tileIndex: 1,
      offsetX: -0,
      offsetY: -0,
    });
  });

  it('stops at the last thumbnail rather than past the end of the sheets', () => {
    // 249 is the last; 249 - 200 = 49, so sheet 2, column 9, row 4.
    expect(thumbnailAt(resolution, 99_999, 320)).toMatchObject({
      tileIndex: 2,
      offsetX: -2880,
      offsetY: -720,
    });
  });

  it('starts at the first thumbnail for a position a media element reports badly', () => {
    for (const bad of [-5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(thumbnailAt(resolution, bad, 320)).toMatchObject({ tileIndex: 0, offsetX: -0 });
    }
  });

  it('scales the whole sheet when the preview is drawn smaller than the thumbnail', () => {
    expect(thumbnailAt(resolution, 125, 160)).toEqual({
      tileIndex: 0,
      width: 160,
      height: 90,
      backgroundWidth: 1600,
      backgroundHeight: 900,
      offsetX: -320,
      offsetY: -90,
    });
  });

  it('never scales a thumbnail up: a preview wider than the sheet draws it as it is', () => {
    expect(thumbnailAt(resolution, 125, 1000)).toMatchObject({ width: 320, height: 180 });
  });
});
