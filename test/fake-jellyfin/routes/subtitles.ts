import type { FakeItem, FakeJellyfinState, FakeMediaStream } from '../data.ts';
import type { FakeRequest, FakeResponse, FakeRoute } from '../routing.ts';
import { mediaSourceIdFor } from './media-info.ts';

/**
 * `SubtitleController`: one subtitle track, converted to the format asked for
 * (#27).
 *
 * This is the **second** place the fake owes a client real data rather than a
 * shape to assert on — `videos.ts` is the first. The subtitle engine parses
 * what it is given, so a fixed `{}` would let a client ship a parser nobody had
 * ever run. The file served is generated per track, and **its text names the
 * track's language**, which is what makes "the User switched to Spanish" a
 * thing a test can read off the screen rather than infer from a URL.
 *
 * Three of the real controller's behaviours are reproduced deliberately, all
 * from `docs/research/jellyfin-playback.md` §14:
 *
 * - **The canonical path carries everything**, including the format as the file
 *   extension and `startPositionTicks` as a path segment. The query aliases are
 *   the older spelling and `format` among them is `[ParameterObsolete]`, so
 *   this route does not read any of them.
 * - **A graphical track is not converted.** PGS and VobSub "cannot be parsed or
 *   rewritten", so the real controller returns the raw file whatever format was
 *   asked for. This answers with bytes and an image content type for exactly
 *   those codecs, which is what makes a client that mistook a bitmap for text
 *   fail here rather than draw nothing on a real Server.
 * - **Both route forms exist**, with and without the position segment.
 *
 * The route is **anonymous**, as `GetSubtitle` is on the real Server: the app
 * sends `ApiKey` in the query anyway, because that is what the Server's own
 * generated URLs do.
 *
 * The format is read out of the last segment here rather than captured by the
 * pattern: `routing.ts` matches whole segments, so `Stream.:format` would be
 * compared literally. `videos.ts` takes the same `:streamFile` approach.
 */
export const subtitleRoutes: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/Videos/:itemId/:mediaSourceId/Subtitles/:index/:startPositionTicks/:streamFile',
    handle: serveSubtitle,
  },
  // The shorter form, which omits the position. The real Server has both.
  {
    method: 'GET',
    path: '/Videos/:itemId/:mediaSourceId/Subtitles/:index/:streamFile',
    handle: serveSubtitle,
  },
];

function serveSubtitle(
  _request: FakeRequest,
  state: FakeJellyfinState,
  params: Readonly<Record<string, string>>,
): FakeResponse {
  if (state.failSubtitleFetchWith !== null) {
    return {
      status: state.failSubtitleFetchWith,
      body: { error: 'The fake Jellyfin was told to fail subtitle fetches.' },
    };
  }

  // `Stream.vtt` → `vtt`. The real route's format *is* the file extension.
  const streamFile = params.streamFile ?? '';
  const dot = streamFile.lastIndexOf('.');
  if (!streamFile.toLowerCase().startsWith('stream.') || dot === -1) {
    return {
      status: 404,
      body: {
        error: `The fake Jellyfin has no subtitle route for ${streamFile}; the path ends Stream.{format}, where the format is the file extension.`,
      },
    };
  }
  const format = streamFile.slice(dot + 1).toLowerCase();

  const itemId = params.itemId ?? '';
  const item = state.items.find((candidate) => candidate.Id === itemId);
  if (item === undefined) {
    return { status: 404, body: { error: `No item ${itemId}.` } };
  }

  // The media source id is quoted back, as the real route takes it, so a client
  // that invented one is caught rather than quietly served.
  const wantedSource = params.mediaSourceId ?? '';
  if (wantedSource !== mediaSourceIdFor(itemId)) {
    return {
      status: 404,
      body: { error: `No media source ${wantedSource} for ${itemId}.` },
    };
  }

  const index = Number(params.index ?? '');
  const stream = (item.MediaStreams ?? []).find((candidate) => candidate.Index === index);
  if (stream === undefined || stream.Type !== 'Subtitle') {
    return {
      status: 404,
      body: {
        error: `Stream ${params.index ?? ''} of ${itemId} is not a subtitle stream. The index is the stream's own MediaStream.Index, not its place in MediaStreams.`,
      },
    };
  }

  // A bitmap is handed over untouched, whatever format was asked for.
  if (isGraphical(stream.Codec)) {
    return {
      status: 200,
      bytes: pgsFile(),
      contentType: 'application/octet-stream',
    };
  }

  return {
    status: 200,
    bytes: new TextEncoder().encode(subtitleFileFor(item, stream, format)),
    contentType: format === 'vtt' ? 'text/vtt' : 'text/plain',
  };
}

/**
 * The same predicates the Server classifies by (§14), which is also what
 * `src/playback/media-tracks.ts` mirrors. Kept here rather than imported from
 * the app: the fake is the Server's side of the boundary and must not be able
 * to agree with the client by sharing its code.
 */
function isGraphical(codec: string | undefined): boolean {
  if (codec === undefined) return false;
  const name = codec.toLowerCase();
  if (name.includes('microdvd')) return false;
  return (
    name.includes('pgs') ||
    /dvd_?sub/.test(name) ||
    /dvb_?sub/.test(name) ||
    name.includes('vobsub') ||
    name === 'sup' ||
    name === 'sub'
  );
}

/**
 * A **real PGS stream** (#30): a `.sup`, built here, that libpgs really
 * decodes.
 *
 * It used to be six bytes of nonsense, which was the right stand-in while
 * nothing could decode one — all #27 needed was something that was not text.
 * #30 draws these, so this becomes the **third** place the fake owes a client
 * real data rather than a shape, beside the video and the text subtitle
 * formats above. A fake that answered an approximation would let a client ship
 * a decoder nobody had ever run, which is exactly the hole #29 fell into.
 *
 * The format is the Blu-ray Presentation Graphic Stream, as a `.sup`: a flat
 * sequence of segments, each behind a ten-byte header of the magic `PG`, a
 * 90 kHz presentation timestamp and a decoding timestamp. A *display set* is a
 * run of segments ending in END, and the ones that matter here are:
 *
 * - **PCS**, the presentation composition: the video's own size, which is what
 *   the renderer sizes its canvas to, and where each object sits in that frame
 * - **WDS**, the window the object is drawn inside
 * - **PDS**, the palette — in YCrCb **and** alpha, which is why entry 0 being
 *   transparent is what makes the rest of the frame show through
 * - **ODS**, the object: a width, a height and run-length-encoded indexes into
 *   that palette
 *
 * Three display sets are written, at **the same times every other format this
 * route serves uses** — 0.5 s, 3 s and 6 s, inside the committed six-second
 * video — so a test can switch from the English SubRip track to this one and
 * compare like with like. The first two each paint a solid bar where a
 * subtitle line would go, in two different colours so they are not the same
 * picture; the third is an empty composition, which is how PGS says "clear".
 *
 * It is deliberately **not** generated per track or per language. The point of
 * the text formats naming their language is that a test can read which track
 * it got off the screen, and a bitmap cannot be read off the screen by anyone
 * — asserting on pixels is what `styled-subtitles.spec.ts` establishes the
 * suite does not do. What a test can see is the canvas taking the stream's own
 * 1920×1080, which is evidence the bytes were fetched, parsed and drawn.
 */
function pgsFile(): Uint8Array {
  const parts: Uint8Array[] = [];
  // A 1080p frame, which is what the renderer sizes the canvas to.
  const width = 1920;
  const height = 1080;
  // Where a subtitle line sits: a wide bar near the bottom of the frame.
  const barWidth = 1200;
  const barHeight = 120;
  const x = Math.round((width - barWidth) / 2);
  const y = 880;

  /*
   * **An empty display set at zero, and it is load-bearing.**
   *
   * libpgs only draws when the active display-set *index* changes
   * (`PgsRendererImpl.renderAtIndex`), and the index it compares against
   * starts at **0** — which is also a perfectly valid index. So a stream whose
   * first display set is the one already on screen when the renderer starts
   * draws nothing at all, silently: the decoder loads, the stream parses, and
   * the canvas stays empty.
   *
   * A real `.sup` rarely trips over this, because a film's first subtitle is
   * minutes in and a User starts at 0 where the index is -1. A six-second test
   * video whose first line is half a second in trips over it every time — and
   * it was found by **looking at a screenshot**, with the e2e assertions
   * green, which is the fourth time on this run that looking has caught what
   * a suite could not.
   *
   * Leading with an empty set fixes it honestly rather than by working around
   * it: index 0 now means "nothing on screen", which is what the sentinel
   * means too, so the two agree instead of colliding.
   */
  parts.push(clearSet(0, width, height));
  // Two visibly different fills, so the second display set is not a repeat of
  // the first. YCrCbA: near-white, then a strong yellow.
  parts.push(displaySet(0.5, { width, height, x, y, barWidth, barHeight, colour: [235, 128, 128] }));
  parts.push(displaySet(3, { width, height, x, y, barWidth, barHeight, colour: [210, 146, 16] }));
  // An empty composition: the PGS way of saying the screen is clear again.
  parts.push(clearSet(6, width, height));

  return concatBytes(parts);
}

type BarOptions = {
  width: number;
  height: number;
  x: number;
  y: number;
  barWidth: number;
  barHeight: number;
  /** The fill as YCrCb, which is the colour space a PGS palette is written in. */
  colour: readonly [number, number, number];
};

/** One display set that puts a solid bar on the screen at `seconds`. */
function displaySet(seconds: number, bar: BarOptions): Uint8Array {
  const pcs = concatBytes([
    u16(bar.width),
    u16(bar.height),
    // Frame rate. The field is written and ignored by every decoder there is.
    u8(0x10),
    u16(0),
    // `0x80`: an epoch start, meaning this set replaces whatever came before
    // rather than updating it. Two independent lines, so both are epochs.
    u8(0x80),
    u8(0),
    u8(0),
    // One composition object: object 0, in window 0, uncropped, at x/y.
    u8(1),
    u16(0),
    u8(0),
    u8(0),
    u16(bar.x),
    u16(bar.y),
  ]);

  const wds = concatBytes([
    u8(1),
    u8(0),
    u16(bar.x),
    u16(bar.y),
    u16(bar.barWidth),
    u16(bar.barHeight),
  ]);

  const pds = concatBytes([
    u8(0),
    u8(0),
    // Entry 0, fully transparent: everything the object does not paint lets
    // the picture through. A palette whose 0 was opaque would black out the
    // whole window, which is the classic way a hand-made PGS looks broken.
    u8(0),
    u8(16),
    u8(128),
    u8(128),
    u8(0),
    // Entry 1, the fill, fully opaque.
    u8(1),
    u8(bar.colour[0]),
    u8(bar.colour[1]),
    u8(bar.colour[2]),
    u8(255),
  ]);

  const rle = solidRectangle(bar.barWidth, bar.barHeight);
  const ods = concatBytes([
    u16(0),
    u8(0),
    // `0xC0`: first **and** last in sequence, so the object is this one
    // segment rather than split across several.
    u8(0xc0),
    // The object's own length: the width and height fields plus the pixels.
    u24(rle.length + 4),
    u16(bar.barWidth),
    u16(bar.barHeight),
    rle,
  ]);

  return concatBytes([
    segment(seconds, 0x16, pcs),
    segment(seconds, 0x17, wds),
    segment(seconds, 0x14, pds),
    segment(seconds, 0x15, ods),
    segment(seconds, 0x80, new Uint8Array(0)),
  ]);
}

/** A display set with nothing in it, which is how PGS clears the screen. */
function clearSet(seconds: number, width: number, height: number): Uint8Array {
  const pcs = concatBytes([
    u16(width),
    u16(height),
    u8(0x10),
    u16(0),
    // A normal composition rather than an epoch start, carrying no objects.
    u8(0x00),
    u8(0),
    u8(0),
    u8(0),
  ]);
  return concatBytes([
    segment(seconds, 0x16, pcs),
    segment(seconds, 0x17, concatBytes([u8(0)])),
    segment(seconds, 0x80, new Uint8Array(0)),
  ]);
}

/**
 * One segment, with the ten-byte header a `.sup` puts before every one of
 * them — the END segment included, which is the detail a hand-rolled writer
 * usually gets wrong.
 */
function segment(seconds: number, type: number, payload: Uint8Array): Uint8Array {
  return concatBytes([
    // 'P', 'G'
    u8(0x50),
    u8(0x47),
    // Presentation and decoding timestamps, both in 90 kHz ticks.
    u32(Math.round(seconds * 90_000)),
    u32(0),
    u8(type),
    u16(payload.length),
    payload,
  ]);
}

/**
 * A filled rectangle, run-length encoded the way PGS encodes one.
 *
 * Each line is one run of palette entry 1 followed by the two zero bytes that
 * end a line. The run uses the four-byte form — `00`, then `11` and a
 * fourteen-bit length, then the colour — because the one-byte-length form
 * tops out at 63 pixels and a subtitle bar is wider than that.
 */
function solidRectangle(width: number, height: number): Uint8Array {
  const line = [0x00, 0xc0 | ((width >> 8) & 0x3f), width & 0xff, 0x01, 0x00, 0x00];
  const bytes = new Uint8Array(line.length * height);
  for (let row = 0; row < height; row += 1) {
    bytes.set(line, row * line.length);
  }
  return bytes;
}

function u8(value: number): Uint8Array {
  return new Uint8Array([value & 0xff]);
}

function u16(value: number): Uint8Array {
  return new Uint8Array([(value >> 8) & 0xff, value & 0xff]);
}

function u24(value: number): Uint8Array {
  return new Uint8Array([(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]);
}

function u32(value: number): Uint8Array {
  return new Uint8Array([
    (value >>> 24) & 0xff,
    (value >>> 16) & 0xff,
    (value >>> 8) & 0xff,
    value & 0xff,
  ]);
}

function concatBytes(parts: readonly Uint8Array[]): Uint8Array {
  let length = 0;
  for (const part of parts) length += part.length;
  const all = new Uint8Array(length);
  let at = 0;
  for (const part of parts) {
    all.set(part, at);
    at += part.length;
  }
  return all;
}

/**
 * Two cues, both inside the six seconds the committed test video really runs
 * for, so an end-to-end test in a real browser can watch one appear and the
 * next replace it.
 *
 * The **text names the language**, which is the point: a test switches to
 * Spanish and reads "Hola" off the screen, so "the picker changed the track"
 * is observed through what a User would see rather than through a URL the app
 * happened to fetch.
 */
function subtitleFileFor(item: FakeItem, stream: FakeMediaStream, format: string): string {
  const [first, second] = linesFor(stream.Language);
  if (format === 'ass' || format === 'ssa') {
    return assFileFor(item, first, second);
  }
  if (format === 'srt') {
    return [
      '1',
      '00:00:00,500 --> 00:00:03,000',
      first,
      '',
      '2',
      '00:00:03,000 --> 00:00:06,000',
      `${second} (${item.Name})`,
      '',
    ].join('\n');
  }
  return [
    'WEBVTT',
    '',
    '00:00:00.500 --> 00:00:03.000',
    first,
    '',
    '00:00:03.000 --> 00:00:06.000',
    `${second} (${item.Name})`,
    '',
  ].join('\n');
}

/** A greeting per language, so the track a client fetched is readable as text. */
function linesFor(language: string | undefined): readonly [string, string] {
  switch (language) {
    case 'spa':
      return ['Hola', 'Adiós'];
    case 'fra':
      return ['Bonjour', 'Au revoir'];
    // Arrival's styled ASS track (#29). Its own words, so a test can tell the
    // styled track apart from the English one it would otherwise read alike.
    case 'jpn':
      return ['こんにちは', 'さようなら'];
    default:
      return ['Hello', 'Goodbye'];
  }
}

/**
 * A styled file (#29), for a track whose codec is `ass` — and the one the
 * Server hands over when `Stream.ass` is asked for.
 *
 * It is a **real ASS file**, not a shape: the flattener and libass both have
 * to be able to read it, and a fake that answered an approximation would let a
 * client ship a parser nobody had run. So it carries what makes such a file
 * hard, and each of these is a rule `flattening-styled-subtitles.test.ts`
 * holds on its own:
 *
 * - a `[Script Info]` and a `[V4+ Styles]` section above the events, and a
 *   `Format:` line naming the event columns
 * - a style naming an **embedded font** by name, which is what the
 *   `MediaAttachments` beside this track carry
 * - override blocks on the dialogue — italics, and a positioned, faded sign
 * - a `Comment:` row, which is in the file and is not a subtitle
 *
 * The two spoken lines keep the **same times as every other format this route
 * serves** (0.5–3 s and 3–6 s, inside the committed six-second video), so a
 * test can switch from the English SubRip track to this one and compare like
 * with like — and the words still name the language, which is what makes "the
 * User switched tracks" readable off the screen.
 */
function assFileFor(item: FakeItem, first: string, second: string): string {
  return [
    '[Script Info]',
    `Title: ${item.Name}`,
    'ScriptType: v4.00+',
    'PlayResX: 1920',
    'PlayResY: 1080',
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    'Style: Default,Heptapod Sans,54,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,2,0,2,10,10,30,1',
    'Style: Sign,Heptapod Display,72,&H00FFD700,&H000000FF,&H00000000,&H00000000,1,0,0,0,100,100,0,0,1,3,0,8,10,10,10,1',
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
    `Comment: 0,0:00:00.00,0:00:00.50,Default,,0,0,0,,Typesetting note: do not show this line.`,
    `Dialogue: 0,0:00:00.50,0:00:03.00,Default,,0,0,0,,{\\i1}${first}{\\i0}`,
    `Dialogue: 0,0:00:03.00,0:00:06.00,Default,,0,0,0,,{\\pos(960,540)\\fad(200,200)}${second} (${item.Name})`,
    '',
  ].join('\n');
}
