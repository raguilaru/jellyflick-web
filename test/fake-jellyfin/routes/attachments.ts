import type { FakeJellyfinState } from '../data.ts';
import type { FakeRequest, FakeResponse, FakeRoute } from '../routing.ts';
import { mediaSourceIdFor } from './media-info.ts';

/**
 * `VideosController.GetAttachment`: one file muxed in beside the video, which
 * for this app means **an embedded font for the styled subtitle renderer**
 * (#29, story 104).
 *
 * This is the **third** place the fake owes a client bytes rather than a shape
 * — `videos.ts` and `subtitles.ts` are the first two — and the least demanding
 * of the three: the renderer fetches a font itself, in its worker, and nothing
 * in this project parses one. What a test needs to see is that the right
 * attachment was asked for at the right address and that the answer arrived
 * with a font's content type, so the bytes are a recognisable stub rather than
 * a real typeface. A committed 150 KB TTF would buy nothing a client could
 * assert on, and `libass` is the only thing that could read it.
 *
 * The route is **anonymous**, as the real one is, and the app sends `ApiKey`
 * in the query anyway — the renderer's worker cannot send a header, which is
 * the same reason the video and the subtitles carry theirs that way.
 */
export const attachmentRoutes: readonly FakeRoute[] = [
  {
    method: 'GET',
    path: '/Videos/:itemId/:mediaSourceId/Attachments/:index',
    handle: serveAttachment,
  },
];

function serveAttachment(
  _request: FakeRequest,
  state: FakeJellyfinState,
  params: Readonly<Record<string, string>>,
): FakeResponse {
  const itemId = params.itemId ?? '';
  const item = state.items.find((candidate) => candidate.Id === itemId);
  if (item === undefined) {
    return { status: 404, body: { error: `No item ${itemId}.` } };
  }

  // Quoted back exactly as the subtitle route does it, so a client that
  // invented a media source id is caught rather than quietly served.
  const wantedSource = params.mediaSourceId ?? '';
  if (wantedSource !== mediaSourceIdFor(itemId)) {
    return {
      status: 404,
      body: { error: `No media source ${wantedSource} for ${itemId}.` },
    };
  }

  const index = Number(params.index ?? '');
  const attachment = (item.MediaAttachments ?? []).find(
    (candidate) => candidate.Index === index,
  );
  if (attachment === undefined) {
    return {
      status: 404,
      body: {
        error: `${itemId} has no attachment ${params.index ?? ''}. The index is the attachment's own MediaAttachment.Index.`,
      },
    };
  }

  return {
    status: 200,
    bytes: fontBytesFor(attachment.FileName ?? `attachment-${String(index)}`),
    // What the real Server sets from the attachment's own type. A font is
    // bytes to everything in this project, so the type is all a test reads.
    contentType: attachment.MimeType ?? 'application/octet-stream',
  };
}

/**
 * Stands in for a font file: a real TrueType signature so the answer is
 * recognisable as one, then the file's own name, so a test that fetched two
 * fonts can tell which it got.
 */
function fontBytesFor(fileName: string): Uint8Array {
  // `0x00010000`, the TrueType version that opens a real `.ttf`.
  const signature = [0x00, 0x01, 0x00, 0x00];
  return new Uint8Array([...signature, ...new TextEncoder().encode(fileName)]);
}
