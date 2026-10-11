import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { FakeRequest, FakeResponse, FakeRoute } from '../routing.ts';
import type { FakeJellyfinState } from '../data.ts';

/**
 * `VideosController`: the bytes a `<video>` actually plays.
 *
 * This is the one place a fake owes a client **real data** rather than a shape
 * to assert on — a browser has to decode what it is given, so an end-to-end
 * test that plays something needs a real file. `media/test-video.webm` is six
 * seconds of VP9 in WebM, drawn by `scripts/make-test-video.mjs` and committed:
 * VP9 because plain Chromium ships no H.264 decoder, so an MP4 would not play
 * in the browser Playwright runs.
 *
 * Every source serves that one file, whatever the Server *claims* the file is in
 * `PlaybackInfo` (see `media-info.ts`): the claim is what the negotiation reads,
 * and the bytes are what the player needs.
 *
 * Range requests are answered, because a browser seeks with them — and seeking
 * is how a resume position is honoured on a direct-played file.
 *
 * `GetVideoStream` on the real Server carries no `[Authorize]`, so no token is
 * required here either (`jellyfin-playback.md` §9). The app sends `ApiKey`
 * anyway, as the Server's own generated URLs do.
 */

const TEST_VIDEO = readFileSync(
  fileURLToPath(new URL('../media/test-video.webm', import.meta.url)),
);

const WEBM = 'video/webm';

export const videoRoutes: readonly FakeRoute[] = [
  // `/Videos/{id}/stream` and `/Videos/{id}/stream.{container}` are both real
  // routes; the extension form is what gives a browser a sensible file name.
  { method: 'GET', path: '/Videos/:itemId/stream', handle: serveTestVideo },
  { method: 'HEAD', path: '/Videos/:itemId/stream', handle: serveTestVideo },
  { method: 'GET', path: '/Videos/:itemId/:streamFile', handle: serveStreamFile },
  { method: 'HEAD', path: '/Videos/:itemId/:streamFile', handle: serveStreamFile },
];

/**
 * `stream.webm`, `stream.mp4` and friends all serve the file; `master.m3u8` is
 * answered with a 501 that says why, because the fake has no transcoder and a
 * playlist pointing at nothing would look like a client bug.
 */
function serveStreamFile(
  request: FakeRequest,
  state: FakeJellyfinState,
  params: Readonly<Record<string, string>>,
): FakeResponse {
  const file = params.streamFile ?? '';
  if (file.endsWith('.m3u8')) {
    return {
      status: 501,
      body: {
        error:
          'The fake Jellyfin has no transcoder, so there is no HLS playlist to serve. A test that needs real HLS has to grow one here; the transcode *decision* is asserted from PlaybackInfo instead.',
      },
    };
  }
  if (!file.startsWith('stream')) {
    return {
      status: 404,
      body: {
        error: `The fake Jellyfin has no route for /Videos/{id}/${file}. Add one under test/fake-jellyfin/routes/videos.ts.`,
      },
    };
  }
  return serveTestVideo(request, state, params);
}

function serveTestVideo(
  request: FakeRequest,
  state: FakeJellyfinState,
  params: Readonly<Record<string, string>>,
): FakeResponse {
  const itemId = params.itemId ?? '';
  if (!state.items.some((item) => item.Id === itemId)) {
    return { status: 404, body: { error: `No item ${itemId}.` } };
  }

  const range = rangeOf(request.headers.range, TEST_VIDEO.byteLength);
  if (range === 'unsatisfiable') {
    return {
      status: 416,
      headers: { 'Content-Range': `bytes */${String(TEST_VIDEO.byteLength)}` },
      body: { error: 'That range is outside the file.' },
    };
  }

  if (range === undefined) {
    return {
      status: 200,
      bytes: TEST_VIDEO,
      contentType: WEBM,
      headers: { 'Accept-Ranges': 'bytes' },
    };
  }

  return {
    status: 206,
    bytes: TEST_VIDEO.subarray(range.from, range.to + 1),
    contentType: WEBM,
    headers: {
      'Accept-Ranges': 'bytes',
      'Content-Range': `bytes ${String(range.from)}-${String(range.to)}/${String(TEST_VIDEO.byteLength)}`,
    },
  };
}

/**
 * One `bytes=` range, which is all a browser ever asks for. `undefined` means
 * the whole file was asked for.
 */
function rangeOf(
  header: string | undefined,
  size: number,
): { from: number; to: number } | 'unsatisfiable' | undefined {
  if (header === undefined) return undefined;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (match === null) return undefined;

  const [, rawFrom, rawTo] = match;
  if (rawFrom === '' && rawTo === '') return undefined;

  // `bytes=-500` is the last 500 bytes.
  if (rawFrom === '') {
    const length = Number(rawTo);
    if (length === 0) return 'unsatisfiable';
    return { from: Math.max(0, size - length), to: size - 1 };
  }

  const from = Number(rawFrom);
  if (from >= size) return 'unsatisfiable';
  const to = rawTo === '' ? size - 1 : Math.min(Number(rawTo), size - 1);
  return { from, to };
}
