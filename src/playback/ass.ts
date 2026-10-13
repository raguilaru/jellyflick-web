import type { SubtitleCue } from './subtitle-cues';

/**
 * ASS and SSA read for their words and their timing (#29).
 *
 * This is the **flattening** half of styled subtitles: what a device that
 * cannot draw them gets, and what a device that can falls back to when the
 * renderer will not load. Story 104 asks for styled subtitles "with their
 * styling where my device can handle it, and as plain text otherwise, so that
 * they're always readable and shiftable", and the plain-text answer is this
 * module. What comes out is the **same `SubtitleCue` list a WebVTT file
 * produces**, which is the point: `subtitles.tsx` draws it with the cursor it
 * already has and #28's offset stays one subtraction, so the Subtitle Offset
 * works either way without a second timing path to keep in step.
 *
 * It lives beside `subtitle-cues.ts` rather than inside it because the two
 * grammars have nothing in common. WebVTT and SubRip differ in a comma and a
 * cue number, which is why one parser serves both; ASS is a different shape
 * altogether — INI-style sections, a `Format:` line that **names its own
 * columns**, and a text field carrying an override language of its own.
 *
 * ## The `Format:` line is read, never assumed
 *
 * `[Events]` begins with a `Format:` line listing its columns, and a file is
 * entitled to order them as it likes — v4.00+ writes
 * `Layer, Start, End, Style, …` and SSA v4.00 writes `Marked, Start, End, …`,
 * so a flattener with the column positions baked in reads an SSA file's
 * `Marked=0` as its layer and every field after it one place out. Reading the
 * header is barely more code than hardcoding it and is the difference between
 * working on one file and working on the format.
 *
 * **The text column is the last one and is not split**, whatever the header
 * says its position is: a line of dialogue may hold commas, and `Text` is
 * documented as final for exactly that reason. So the row is split only as
 * many times as there are columns before it.
 *
 * ## What is dropped, and why that is the whole job
 *
 * Everything that makes the file styled: `[Script Info]`, `[V4+ Styles]`, the
 * `[Fonts]` and `[Graphics]` blobs, `Comment:` rows, the layer, the style
 * name, the actor, the margins and the effect. Of the text field, the override
 * blocks — `{\i1}`, `{\pos(…)}`, `{\fad(…)}` — go too.
 *
 * One of those deserves naming, because dropping it is not merely tidying:
 * `{\p1}` switches the text field into **vector drawing mode**, where what
 * follows is a path of coordinates rather than words. Typesetting a sign that
 * way is common in subtitled anime, which is the material this ticket's
 * styling exists for. Flattened without care, such a row becomes a line of
 * numbers drawn over the picture where a User expected speech — worse than
 * nothing, because it looks like a bug in the player rather than a file this
 * device cannot fully draw. So a drawing row contributes no cue at all.
 */

/**
 * Whether a subtitle codec is a styled one, which is what decides whether the
 * styled renderer is worth loading for a track (`styled-subtitles.ts`).
 *
 * `jellyfin-playback.md` §14's text codecs include `ass` and `ssa`, and those
 * are the two the Server converts to and from. `media-tracks.ts` already reads
 * both as `text`, which is right — they *are* text — so this is a narrower
 * question asked of the same field rather than a change to that classification.
 */
export function isStyledSubtitleCodec(codec: unknown): boolean {
  if (typeof codec !== 'string') return false;
  const name = codec.toLowerCase();
  return name === 'ass' || name === 'ssa';
}

/**
 * An ASS or SSA file as plain cues, in time order.
 *
 * Anything unreadable comes back as **no cues**, which is the line
 * `parseSubtitles` already holds: a file that will not parse is a track with
 * nothing to draw, and the player already says that to a User.
 */
export function flattenAss(text: string): SubtitleCue[] {
  const cues: SubtitleCue[] = [];
  /** The columns the `[Events]` header named, lower-cased. */
  let columns: readonly string[] | undefined;
  let inEvents = false;

  for (const raw of text.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim();
    if (line === '') continue;

    // A section header. `[Events]` is the only one with cues in it, and saying
    // so explicitly is what keeps a `[Fonts]` blob's base64 — which can hold
    // anything, including something shaped like a row — out of the cue list.
    if (line.startsWith('[')) {
      inEvents = line.toLowerCase() === '[events]';
      continue;
    }
    if (!inEvents) continue;

    const colon = line.indexOf(':');
    if (colon === -1) continue;
    const descriptor = line.slice(0, colon).trim().toLowerCase();
    const body = line.slice(colon + 1);

    if (descriptor === 'format') {
      columns = body.split(',').map((name) => name.trim().toLowerCase());
      continue;
    }
    // `Comment:` rows are the format's own way of keeping a line in the file
    // without showing it, and `Picture:`/`Sound:`/`Movie:`/`Command:` are not
    // words on a screen either.
    if (descriptor !== 'dialogue') continue;

    const cue = cueFrom(body, columns ?? DEFAULT_COLUMNS);
    if (cue !== undefined) cues.push(cue);
  }

  // Sorted for the cursor, which walks in time order; a file is not obliged to
  // be. The tie-break on `end` rather than a stable sort is ADR 0002:
  // `Array.prototype.sort`'s stability is Chromium 70, one above the floor.
  return cues.sort((one, other) => one.start - other.start || one.end - other.end);
}

/**
 * The v4.00+ column order, used only for a file whose `[Events]` section has no
 * `Format:` line at all. Such a file is malformed, and guessing the documented
 * order reads it rather than discarding it.
 */
const DEFAULT_COLUMNS: readonly string[] = [
  'layer',
  'start',
  'end',
  'style',
  'name',
  'marginl',
  'marginr',
  'marginv',
  'effect',
  'text',
];

/** One `Dialogue:` row as a cue, or nothing if it does not hold one. */
function cueFrom(body: string, columns: readonly string[]): SubtitleCue | undefined {
  const textAt = columns.indexOf('text');
  // The text column is last and may hold commas, so the row is split exactly
  // as many times as there are columns before it and the remainder is the text.
  const at = textAt === -1 ? columns.length : textAt;
  const fields = splitLeaving(body, at);

  const start = secondsOf(fields[columns.indexOf('start')]);
  const end = secondsOf(fields[columns.indexOf('end')]);
  // A row that ends before it starts is a broken file rather than a cue to
  // leave on the screen for ever; the cursor leans on `end` being the later.
  if (start === undefined || end === undefined || end <= start) return undefined;

  const words = plainTextOf(fields[at] ?? '');
  if (words === undefined || words === '') return undefined;

  return { start, end, text: words };
}

/**
 * `body` split on commas into `count` fields plus whatever is left, so the last
 * field keeps every comma in it.
 */
function splitLeaving(body: string, count: number): readonly string[] {
  const fields: string[] = [];
  let from = 0;
  for (let taken = 0; taken < count; taken += 1) {
    const comma = body.indexOf(',', from);
    if (comma === -1) {
      fields.push(body.slice(from));
      return fields;
    }
    fields.push(body.slice(from, comma));
    from = comma + 1;
  }
  fields.push(body.slice(from));
  return fields;
}

/** `H:MM:SS.cc` as seconds. ASS writes **hundredths**, not thousandths. */
function secondsOf(stamp: string | undefined): number | undefined {
  if (stamp === undefined) return undefined;
  const parts = stamp.trim().split(':');
  if (parts.length !== 3) return undefined;
  const hours = Number(parts[0]);
  const minutes = Number(parts[1]);
  const seconds = Number(parts[2]);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) {
    return undefined;
  }
  return hours * 3600 + minutes * 60 + seconds;
}

/**
 * A text field as plain text: the override blocks gone, ASS's own line breaks
 * turned into real ones, and `undefined` for a row that holds a drawing rather
 * than words.
 */
function plainTextOf(field: string): string | undefined {
  // Drawing mode, which is a path of coordinates and not speech. `\p0` turns it
  // back off, but a row that enters it at all is typesetting rather than
  // dialogue, so the whole row is given up rather than part of it kept.
  if (/\{[^}]*\\p[1-9]/.test(field)) return undefined;

  return (
    field
      // Every override block, including one holding several overrides.
      .replace(/\{[^}]*\}/g, '')
      // `\N` is a hard break; `\n` is a soft one, which is a break in the
      // wrapped-text mode this flattener does not have, so both are lines here.
      .replace(/\\[Nn]/g, '\n')
      // A non-breaking space, which is a space once nothing is being aligned.
      .replace(/\\h/g, ' ')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line !== '')
      .join('\n')
  );
}
