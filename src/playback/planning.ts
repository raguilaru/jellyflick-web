import type { DeviceLayer } from '../device/types';
import type {
  JellyfinGateway,
  MediaSourceInfo,
  PlayMethod,
} from '../jellyfin/gateway';
import { deviceProfileFor } from './device-profile';
import { tracksOf, type MediaTracks } from './media-tracks';

/**
 * Asking the Server how to play a Title, and turning its answer into the one
 * thing the player needs: a URL, how to feed it to a `<video>`, and the ids
 * every later report has to quote.
 *
 * The decision order is the Server's own (`jellyfin-playback.md` §9): pick a
 * media source, play it as it is if the source says so, otherwise use the
 * `TranscodingUrl` **verbatim**, and otherwise say it cannot be played. The
 * transcoding URL is already fully parameterised and already carries its own
 * `ApiKey`; rebuilding it is the mistake this module exists to not make.
 */

/** How the URL has to be fed to a `<video>`. */
export type PlaybackDelivery =
  /** Straight onto `video.src`: a file, or a progressive transcode. */
  | 'file'
  /** An HLS playlist, so either the device's own player or hls.js. */
  | 'hls';

export type PlaybackPlan = {
  readonly itemId: string;
  readonly mediaSourceId: string;
  /** From `PlaybackInfoResponse`. Every later report carries it. */
  readonly playSessionId: string;
  /** Absolute, and ready for a `<video>`. */
  readonly url: string;
  readonly playMethod: PlayMethod;
  readonly delivery: PlaybackDelivery;
  /** Where to start, in 100-nanosecond ticks. */
  readonly startTicks: number;
  /** The source's length, when the Server said. */
  readonly runtimeTicks?: number;
  /**
   * The streams the Server chose for this User — it has already applied their
   * `AudioLanguagePreference`, `SubtitleLanguagePreference` and `SubtitleMode`,
   * so the player uses these rather than matching languages again (#27).
   *
   * That is not tidiness: the rule lives on the Server, every other Jellyfin
   * app follows it, and a second copy in this client would disagree with them
   * the first time a `SubtitleMode` was involved.
   */
  readonly audioStreamIndex?: number;
  readonly subtitleStreamIndex?: number;
  /** Every track the file holds, which is what the picker offers (#27). */
  readonly tracks: MediaTracks;
};

/**
 * Three answers, and the two failures are deliberately not the same thing: a
 * Server that would not answer is a problem with the Server, and a Server that
 * answered "there is no way to play this" is a healthy Server saying no. #26
 * shows the User a different message for each.
 */
export type PlaybackAttempt =
  | { outcome: 'play'; plan: PlaybackPlan }
  | { outcome: 'cannot-play'; errorCode?: string }
  | { outcome: 'unavailable' };

export type PlanPlaybackOptions = {
  itemId: string;
  userId: string;
  device: DeviceLayer;
  /** Where this User left off, in ticks. Absent or 0 starts at the beginning. */
  resumeTicks?: number;
  /**
   * A track the User has chosen for themselves (#27). Absent leaves the choice
   * to the Server, which applies their account's own preferences — so this is
   * only ever set after a User has pressed something in the track picker.
   *
   * It has to go into the *request*: a direct-played file is served with every
   * track in it and the browser picks one by itself, and a transcode is cut to
   * carry the single track the Server was told to use.
   */
  audioStreamIndex?: number;
  subtitleStreamIndex?: number;
};

export async function planPlayback(
  gateway: JellyfinGateway,
  options: PlanPlaybackOptions,
): Promise<PlaybackAttempt> {
  const capabilities = options.device.videoCapabilities();
  const profile = deviceProfileFor(capabilities);
  const startTicks = options.resumeTicks ?? 0;

  let answer;
  try {
    answer = await gateway.getPlaybackInfo({
      itemId: options.itemId,
      userId: options.userId,
      deviceProfile: profile,
      // The resume point goes into the *request*, not only into the player: a
      // transcode has to be started from there, because the Server cuts the
      // segments and a client cannot seek into a stream that does not exist.
      startTimeTicks: startTicks,
      maxStreamingBitrate: profile.MaxStreamingBitrate,
      ...numberIf('audioStreamIndex', options.audioStreamIndex),
      ...numberIf('subtitleStreamIndex', options.subtitleStreamIndex),
    });
  } catch {
    return { outcome: 'unavailable' };
  }

  const errorCode = answer.ErrorCode;
  if (typeof errorCode === 'string' && errorCode !== '') {
    return { outcome: 'cannot-play', errorCode };
  }

  const source = (answer.MediaSources ?? []).find(
    (candidate) => typeof candidate.Id === 'string' && candidate.Id !== '',
  );
  const playSessionId = answer.PlaySessionId;
  if (source === undefined || typeof playSessionId !== 'string' || playSessionId === '') {
    return { outcome: 'cannot-play' };
  }

  const chosen = urlFor(gateway, options.itemId, source, playSessionId);
  if (chosen === undefined) return { outcome: 'cannot-play' };

  return {
    outcome: 'play',
    plan: {
      itemId: options.itemId,
      mediaSourceId: source.Id as string,
      playSessionId,
      url: chosen.url,
      playMethod: chosen.playMethod,
      delivery: chosen.delivery,
      startTicks,
      ...numberIf('runtimeTicks', source.RunTimeTicks),
      ...numberIf('audioStreamIndex', source.DefaultAudioStreamIndex),
      ...numberIf('subtitleStreamIndex', source.DefaultSubtitleStreamIndex),
      tracks: tracksOf(source),
    },
  };
}

/**
 * The URL to play, and what it is. Direct play first, because a file served
 * untouched costs the Server nothing and is the best picture there is; then the
 * Server's own transcoding URL, used as given.
 */
function urlFor(
  gateway: JellyfinGateway,
  itemId: string,
  source: MediaSourceInfo,
  playSessionId: string,
): { url: string; playMethod: PlayMethod; delivery: PlaybackDelivery } | undefined {
  const mediaSourceId = source.Id as string;

  if (source.SupportsDirectPlay === true) {
    return {
      url: gateway.videoStreamUrl({
        itemId,
        mediaSourceId,
        playSessionId,
        ...(typeof source.Container === 'string' && source.Container !== ''
          ? { container: source.Container }
          : {}),
      }),
      playMethod: 'DirectPlay',
      delivery: 'file',
    };
  }

  const transcodingUrl = source.TranscodingUrl;
  if (typeof transcodingUrl === 'string' && transcodingUrl !== '') {
    return {
      url: gateway.absoluteUrl(transcodingUrl),
      // `DirectStream` is a remux rather than a re-encode, and the Server says
      // which it did through the source's own flags; a transcoding URL that
      // only remuxes still reports `Transcode`, which is what the official
      // clients do and what keeps the session list honest.
      playMethod: 'Transcode',
      delivery: source.TranscodingSubProtocol === 'hls' ? 'hls' : 'file',
    };
  }

  return undefined;
}

function numberIf<K extends string>(key: K, value: unknown): { [P in K]?: number } {
  if (typeof value !== 'number' || !Number.isFinite(value)) return {};
  return { [key]: value } as { [P in K]?: number };
}
