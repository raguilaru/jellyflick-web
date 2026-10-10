/**
 * Draws the app icons in `public/icons/` and nothing else.
 *
 * Run it by hand (`node scripts/make-icons.mjs`) when the mark or the accent
 * changes; the PNGs it writes are committed. It is deliberately NOT part of
 * `npm run build`: the icons are shipped artifacts, so a reviewer should see
 * them change in a diff, and the production build must not depend on a
 * rasteriser of our own.
 *
 * It has no dependencies — a 1-bit-per-shape rasteriser and `node:zlib` are
 * enough for a flat mark, and adding an image library to draw two rectangles
 * and an arc would be the opposite of this project's lightness constraint.
 *
 * The mark is the wordmark's initial: upright condensed capitals, flat, no
 * curve to the baseline (see `docs/architecture.md`, "The wordmark"). Bebas
 * Neue is not read here — the glyph is two primitives, a stem and a hook, so
 * the icon owes nothing to a font file at build time.
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** From `src/styles/base.css`. Kept in step by `test/unit/installable-app.test.ts`. */
const ACCENT = [0xd1, 0x12, 0x1b];
const TEXT_STRONG = [0xf5, 0xf5, 0xf7];

/** Samples per pixel per axis. 4 is enough: the mark is flat, not hairline. */
const SUPERSAMPLE = 4;

/**
 * The glyph in a unit box, y downwards: a stem and a quarter-turn hook, both of
 * one stroke width. Condensed, so the stroke is wide relative to the box.
 */
const STROKE = 0.26;
const HOOK_RADIUS = 0.26;
const STEM_CENTRE_X = 0.76;
const HOOK_CENTRE = { x: STEM_CENTRE_X - HOOK_RADIUS, y: 1 - HOOK_RADIUS - STROKE / 2 };

function insideGlyph(x, y) {
  const half = STROKE / 2;
  if (y < 0) return false; // The stem starts at the cap line, not above it.
  if (y <= HOOK_CENTRE.y) return Math.abs(x - STEM_CENTRE_X) <= half;
  const dx = x - HOOK_CENTRE.x;
  const dy = y - HOOK_CENTRE.y;
  return Math.abs(Math.sqrt(dx * dx + dy * dy) - HOOK_RADIUS) <= half;
}

/** A rounded square, as a coverage test in the same unit box. */
function insideRoundedSquare(x, y, radius) {
  if (x < 0 || x > 1 || y < 0 || y > 1) return false;
  const cx = Math.min(Math.max(x, radius), 1 - radius);
  const cy = Math.min(Math.max(y, radius), 1 - radius);
  const dx = x - cx;
  const dy = y - cy;
  return dx * dx + dy * dy <= radius * radius;
}

/**
 * Renders one icon as raw RGB rows.
 *
 * `maskable` means the platform may crop anything outside a circle of 80% of
 * the icon's width, so the field goes edge to edge and the mark is pulled in
 * far enough that its corners stay inside that circle.
 */
function renderIcon(size, { maskable }) {
  // The mark's box, centred. A maskable icon's safe circle has radius 0.4;
  // this box's half-diagonal is 0.634 × its side, so 0.60 keeps it inside with
  // room to spare. The plain icons use the same figure, so the two look alike.
  const markSide = size * 0.6;
  const markOrigin = (size - markSide) / 2;
  const cornerRadius = maskable ? 0 : 0.22;

  const rows = [];
  const step = 1 / SUPERSAMPLE;
  const offset = step / 2;

  for (let py = 0; py < size; py += 1) {
    const row = Buffer.alloc(size * 3);
    for (let px = 0; px < size; px += 1) {
      // Coverage of the field and of the mark, independently, so the mark's
      // edge is antialiased against the field rather than against the page.
      let field = 0;
      let mark = 0;
      for (let sy = 0; sy < SUPERSAMPLE; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLE; sx += 1) {
          const x = px + offset + sx * step;
          const y = py + offset + sy * step;
          if (maskable || insideRoundedSquare(x / size, y / size, cornerRadius)) field += 1;
          if (insideGlyph((x - markOrigin) / markSide, (y - markOrigin) / markSide)) mark += 1;
        }
      }
      const samples = SUPERSAMPLE * SUPERSAMPLE;
      const fieldAlpha = field / samples;
      const markAlpha = (mark / samples) * fieldAlpha;

      for (let channel = 0; channel < 3; channel += 1) {
        // Composited onto the page's own background, so the icon is opaque:
        // a transparent icon is darkened differently by every launcher.
        const page = 0x0b;
        const withField = page + (ACCENT[channel] - page) * fieldAlpha;
        const withMark = withField + (TEXT_STRONG[channel] - withField) * markAlpha;
        row[px * 3 + channel] = Math.round(withMark);
      }
    }
    rows.push(row);
  }
  return rows;
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const checksum = Buffer.alloc(4);
  checksum.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, checksum]);
}

/** An 8-bit truecolour PNG, filter 0 on every scanline. */
function encodePng(size, rows) {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: truecolour, no alpha
  const raw = Buffer.concat(rows.map((row) => Buffer.concat([Buffer.from([0]), row])));
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const ICONS = [
  { file: 'icon-192.png', size: 192, maskable: false },
  { file: 'icon-512.png', size: 512, maskable: false },
  { file: 'icon-maskable-512.png', size: 512, maskable: true },
];

const directory = join(import.meta.dirname, '..', 'public', 'icons');
mkdirSync(directory, { recursive: true });

for (const { file, size, maskable } of ICONS) {
  const png = encodePng(size, renderIcon(size, { maskable }));
  writeFileSync(join(directory, file), png);
  process.stdout.write(`${file}  ${String(size)}×${String(size)}  ${String(png.length)} bytes\n`);
}
