import { deflateSync } from 'node:zlib';
import type { FakeTrickplayInfo } from '../data.ts';
import type { FakeRoute } from '../routing.ts';

/**
 * `TrickplayController`: the tile images a User scrubs through (#32,
 * story 90).
 *
 * This is the **fourth** place the fake owes a client real bytes rather than a
 * shape, after the video, the subtitle files and #30's PGS stream, and for the
 * same reason each of those does: a browser has to decode what it is given,
 * and a thumbnail strip is a thing that can be geometrically wrong while every
 * assertion about it passes. A JSON stand-in would let a sheet be drawn at the
 * wrong offset, or not drawn at all, with nothing to see.
 *
 * So `tileSheet()` writes a **real PNG** — a sheet of `TileWidth x TileHeight`
 * flat-coloured cells, each a different hue, each with a darker band down its
 * left edge. The colours are what make a wrong `background-position` visible
 * in a screenshot: every cell is distinguishable from every other, so a
 * preview showing cell 0 when it should show cell 4 looks wrong to a person
 * even though both are "an image in a box".
 *
 * PNG rather than JPEG despite the `.jpg` in the path. The extension is the
 * real Server's and is kept, because a client builds that URL and must not be
 * allowed to build a different one; the bytes are PNG because a browser sniffs
 * an image by its content and a correct PNG can be written here in a few lines
 * where a correct JPEG cannot.
 *
 * The real route carries no `[Authorize]` in the sense a test needs — the app
 * sends `ApiKey` in the query, as the Server's own generated URLs do, and as
 * the video route already accepts.
 */
export const trickplayRoutes: readonly FakeRoute[] = [
  {
    method: 'GET',
    // `{index}.jpg` is one whole segment, so the extension is read off the
    // parameter in the handler — the habit `routing.ts` documents and both
    // `/Videos` route families already follow.
    path: '/Videos/:itemId/Trickplay/:width/:tileFile',
    handle: (request, state, params) => {
      const itemId = params.itemId ?? '';
      const item = state.items.find((candidate) => candidate.Id === itemId);
      const mediaSourceId = request.query.get('mediaSourceId') ?? `source-${itemId}`;
      const info = item?.Trickplay?.[mediaSourceId]?.[params.width ?? ''];
      if (info === undefined) {
        return {
          status: 404,
          body: {
            error: `No trickplay thumbnails of width ${String(params.width)} for ${itemId}.`,
          },
        };
      }

      const tileIndex = Number.parseInt((params.tileFile ?? '').replace(/\.[a-z]+$/i, ''), 10);
      if (!Number.isFinite(tileIndex) || tileIndex < 0 || tileIndex >= tilesIn(info)) {
        return {
          status: 404,
          body: { error: `No tile image ${String(params.tileFile)} for ${itemId}.` },
        };
      }

      return {
        status: 200,
        bytes: tileSheet(info, tileIndex),
        contentType: 'image/png',
      };
    },
  },
];

/** How many tile images one manifest's thumbnails are spread across. */
function tilesIn(info: FakeTrickplayInfo): number {
  return Math.ceil(info.ThumbnailCount / (info.TileWidth * info.TileHeight));
}

/**
 * One tile image: `TileWidth x TileHeight` cells, each `Width x Height`, each
 * a distinct flat colour with a darker band down its left edge.
 *
 * The band is there so a preview that is drawn at the right size but offset by
 * part of a cell is visible as two colours rather than one, which a flat sheet
 * would hide.
 */
function tileSheet(info: FakeTrickplayInfo, tileIndex: number): Uint8Array {
  const sheetWidth = info.Width * info.TileWidth;
  const sheetHeight = info.Height * info.TileHeight;
  // One filter byte per row, then RGB.
  const raw = new Uint8Array(sheetHeight * (1 + sheetWidth * 3));

  for (let y = 0; y < sheetHeight; y += 1) {
    const rowStart = y * (1 + sheetWidth * 3);
    raw[rowStart] = 0;
    const row = Math.floor(y / info.Height);
    for (let x = 0; x < sheetWidth; x += 1) {
      const column = Math.floor(x / info.Width);
      const cell = tileIndex * info.TileWidth * info.TileHeight + row * info.TileWidth + column;
      const dark = x % info.Width < Math.max(2, Math.floor(info.Width / 8));
      const [red, green, blue] = colourOf(cell, dark);
      const at = rowStart + 1 + x * 3;
      raw[at] = red;
      raw[at + 1] = green;
      raw[at + 2] = blue;
    }
  }

  return png(sheetWidth, sheetHeight, raw);
}

/** A distinct colour per thumbnail, walked round the hue circle by thirds. */
function colourOf(cell: number, dark: boolean): [number, number, number] {
  const hue = (cell * 47) % 360;
  const rgb = hueToRgb(hue);
  if (!dark) return rgb;
  return [Math.floor(rgb[0] / 3), Math.floor(rgb[1] / 3), Math.floor(rgb[2] / 3)];
}

function hueToRgb(hue: number): [number, number, number] {
  const sector = hue / 60;
  const rising = Math.round((sector % 1) * 255);
  switch (Math.floor(sector) % 6) {
    case 0:
      return [255, rising, 0];
    case 1:
      return [255 - rising, 255, 0];
    case 2:
      return [0, 255, rising];
    case 3:
      return [0, 255 - rising, 255];
    case 4:
      return [rising, 0, 255];
    default:
      return [255, 0, 255 - rising];
  }
}

/** The smallest honest PNG: a signature, IHDR, one IDAT and IEND. */
function png(width: number, height: number, raw: Uint8Array): Uint8Array {
  const header = new Uint8Array(13);
  const view = new DataView(header.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour, no alpha
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlacing

  const chunks = [
    new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', new Uint8Array(deflateSync(raw))),
    chunk('IEND', new Uint8Array(0)),
  ];

  const total = chunks.reduce((sum, part) => sum + part.length, 0);
  const out = new Uint8Array(total);
  let at = 0;
  for (const part of chunks) {
    out.set(part, at);
    at += part.length;
  }
  return out;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i += 1) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n += 1) {
    let value = n;
    for (let k = 0; k < 8; k += 1) {
      value = (value & 1) === 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[n] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (CRC_TABLE[(crc ^ byte) & 0xff] as number) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}
