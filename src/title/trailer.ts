import type { TitleDetails } from '../catalogue/catalogue';

/**
 * The two rules behind the title page's Watch trailer and Download File
 * buttons (#19, stories 75–77), as pure functions of what the Server said.
 *
 * No DOM and no gateway, the way `play-target.ts` beside it holds what Play
 * means: the screen decides how a trailer is drawn, and this decides whether
 * there is one and which kind.
 */

/**
 * What pressing Watch trailer means for one Title.
 *
 * **Local is preferred and that is the whole of story 75's first half.** A file
 * the Server holds plays through this app's own player — negotiated, reported
 * and closable like anything else — while a YouTube trailer is a third party's
 * page in an `<iframe>`. The Server's own file is better in every way a User
 * would notice, so the remote one is the fallback and never the choice.
 *
 * `undefined` is "this Title has no trailer", and the button is simply not
 * drawn: a Title with nothing to show is not worth a disabled control or a
 * line of explanation (story 81's rule, the same one the facts line follows).
 */
export type TrailerOffer =
  /**
   * A trailer file beside the Title on the Server. Which one is not known yet
   * — `GET /Items/{id}/LocalTrailers` is asked **when the button is pressed**,
   * not when the page is drawn, because `LocalTrailerCount` already says
   * whether there is one and a page nobody presses should cost nothing.
   */
  | { kind: 'local' }
  /** A YouTube trailer, as the URL an `<iframe>` would be given. */
  | { kind: 'youtube'; embedUrl: string };

export function trailerOffer(details: TitleDetails): TrailerOffer | undefined {
  if (details.localTrailerCount > 0) return { kind: 'local' };

  for (const trailer of details.remoteTrailers) {
    const embedUrl = youTubeEmbedUrl(trailer);
    if (embedUrl !== undefined) return { kind: 'youtube', embedUrl };
  }

  return undefined;
}

/**
 * One of Jellyfin's `RemoteTrailers` URLs as something this app can embed, or
 * `undefined` for anything that is not a YouTube video.
 *
 * Jellyfin stores whatever the metadata provider gave it, which in practice is
 * one of three YouTube spellings — `watch?v=`, `youtu.be/` and `/embed/` — and
 * occasionally something else entirely. Anything else is refused rather than
 * opened: story 75 asks for a YouTube embed, and a button that opened an
 * arbitrary page would be a different feature.
 *
 * **`youtube-nocookie.com`, and the id is checked rather than trusted.** The
 * privacy-preserving host is YouTube's own and costs nothing; checking the id
 * against YouTube's eleven URL-safe characters is what stops a Server's
 * metadata deciding what URL this app builds.
 */
export function youTubeEmbedUrl(url: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return undefined;
  }

  const host = parsed.hostname.replace(/^www\./, '');
  // The path, split on `/` with the empty leading segment dropped.
  const segments = parsed.pathname.split('/').filter((segment) => segment !== '');

  let videoId: string | undefined;
  if (host === 'youtu.be') {
    videoId = segments[0];
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    videoId =
      segments[0] === 'embed' || segments[0] === 'v'
        ? segments[1]
        : (parsed.searchParams.get('v') ?? undefined);
  }

  if (videoId === undefined || !YOUTUBE_VIDEO_ID.test(videoId)) return undefined;

  // The start time, and nothing else a link happens to carry: `t=` is the one
  // parameter that means something about the trailer itself.
  const start = startSecondsOf(parsed.searchParams.get('t'));
  const query = start === undefined ? '' : `?start=${String(start)}`;
  return `https://www.youtube-nocookie.com/embed/${videoId}${query}`;
}

/** YouTube's own video ids: eleven characters, all of them URL-safe. */
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

/** `t=90` or `t=90s`, as whole seconds. Anything else is no start time. */
function startSecondsOf(value: string | null): number | undefined {
  if (value === null) return undefined;
  const match = /^(\d{1,6})s?$/.exec(value);
  if (match === null) return undefined;
  const seconds = Number(match[1]);
  return seconds > 0 ? seconds : undefined;
}

/**
 * Whether this User is offered the original file of this Title (stories 76 and
 * 77).
 *
 * **Both halves have to be true**, and they are different questions.
 * `Policy.EnableContentDownloading` is what the Server allows this *User* —
 * `jellyfin-playback.md` §15 shows the download endpoint authorised by exactly
 * that permission — and the session carries it from `GET /Users/Me`.
 * `CanDownload` is what the Server says about this *Title*, which also accounts
 * for there being a real file behind it, so a Title the Server holds no file
 * for is never offered.
 *
 * A Server that said nothing means no: a button that could only answer 404 is
 * worse than no button.
 */
export function canDownloadFile(
  details: TitleDetails,
  userMayDownload: boolean,
): boolean {
  return userMayDownload && details.canDownload === true;
}
