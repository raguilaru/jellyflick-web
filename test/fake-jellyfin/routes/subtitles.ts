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
      bytes: GRAPHICAL_SUBTITLE_BYTES,
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

/** Stands in for a PGS file: not text, and nothing a parser can do with it. */
const GRAPHICAL_SUBTITLE_BYTES = new Uint8Array([0x50, 0x47, 0x00, 0x01, 0x02, 0x03]);

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
