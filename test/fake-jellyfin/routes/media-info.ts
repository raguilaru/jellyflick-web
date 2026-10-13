import {
  DEFAULT_USER_CONFIGURATION,
  type FakeItem,
  type FakeMediaFile,
  type FakeMediaSegment,
  type FakeMediaStream,
  type FakeUserConfiguration,
} from '../data.ts';
import type { FakeRoute } from '../routing.ts';
import { tokenFromAuthorization, userForToken } from './users.ts';

/**
 * `MediaInfoController`: `POST /Items/{itemId}/PlaybackInfo`, the one call that
 * decides how a Title is played (#25).
 *
 * This route really negotiates. It matches the **posted DeviceProfile** against
 * the file it holds for the item, so a profile that claims the wrong container
 * or forgets a codec changes the answer here rather than only on a real Server.
 * That is the whole value of faking this endpoint at all: the alternative — a
 * fixed answer — would let a client ship a profile nobody had ever read.
 *
 * Two of the real endpoint's habits are reproduced deliberately:
 *
 * - **The arguments go in the body.** The real `POST` also accepts them as query
 *   parameters, which `jellyfin-playback.md` §9 notes are the older form and
 *   cannot carry a `DeviceProfile` at all. This fake **refuses** a query
 *   parameter outright, so a client that sends one is caught.
 * - **`TranscodingUrl`, `SupportsDirectPlay` and `SupportsDirectStream` are per
 *   `MediaSourceInfo`, not on the response.** That is the single most common
 *   mistake with this endpoint, so the fake cannot be read the other way.
 */
export const mediaInfoRoutes: readonly FakeRoute[] = [
  {
    method: 'POST',
    path: '/Items/:itemId/PlaybackInfo',
    handle: (request, state, params) => {
      const authorization = request.headers.authorization ?? '';
      const user = userForToken(authorization, state);
      if (user === undefined) {
        return { status: 401, body: { error: 'No valid token.' } };
      }

      if (state.failPlaybackInfoWith !== null) {
        return {
          status: state.failPlaybackInfoWith,
          body: { error: 'The fake Jellyfin was told to fail PlaybackInfo.' },
        };
      }

      // The query form is the deprecated one and cannot carry a profile.
      const queried = Array.from(request.query.keys());
      if (queried.length > 0) {
        return {
          status: 400,
          body: {
            error: `PlaybackInfo takes its arguments in the body; these arrived as query parameters: ${queried.join(', ')}.`,
          },
        };
      }

      const body = (request.body ?? {}) as Record<string, unknown>;
      const profile = body.DeviceProfile;
      if (!isObject(profile)) {
        return {
          status: 400,
          body: { error: 'PlaybackInfo needs a DeviceProfile in its body.' },
        };
      }

      const itemId = params.itemId ?? '';
      const item = state.items.find((candidate) => candidate.Id === itemId);
      if (item === undefined) {
        return { status: 404, body: { error: `No item ${itemId}.` } };
      }

      // A Server that will not play something says so with an error code and no
      // playable source, rather than with a failed request.
      if (state.playbackErrorCode !== null) {
        return {
          status: 200,
          body: {
            MediaSources: [],
            PlaySessionId: playSessionFor(itemId),
            ErrorCode: state.playbackErrorCode,
          },
        };
      }

      const media = item.media;
      if (media === undefined) {
        // An item the Server holds no file for: no sources, and no error code
        // either, because nothing went wrong.
        return {
          status: 200,
          body: { MediaSources: [], PlaySessionId: playSessionFor(itemId), ErrorCode: null },
        };
      }

      const token = tokenFromAuthorization(authorization) ?? '';
      const configuration = {
        ...DEFAULT_USER_CONFIGURATION,
        ...(state.userConfiguration[user.Id] ?? {}),
      };
      return {
        status: 200,
        body: {
          MediaSources: [
            sourceFor(
              item,
              media,
              profile,
              token,
              body,
              configuration,
              state.mediaSegments[item.Id] ?? [],
            ),
          ],
          PlaySessionId: playSessionFor(itemId),
          ErrorCode: null,
        },
      };
    },
  },
];

/** Deterministic, so a test can name the session every later report carries. */
export function playSessionFor(itemId: string): string {
  return `play-session-${itemId}`;
}

/** The media source id for an item, which every later call quotes back. */
export function mediaSourceIdFor(itemId: string): string {
  return `source-${itemId}`;
}

function sourceFor(
  item: FakeItem,
  media: FakeMediaFile,
  profile: Record<string, unknown>,
  token: string,
  body: Record<string, unknown>,
  configuration: FakeUserConfiguration,
  segments: readonly FakeMediaSegment[],
): Record<string, unknown> {
  const direct = directPlayAllowed(media, profile);
  const subProtocol = hlsWanted(profile) ? 'hls' : 'http';
  const startTicks = typeof body.StartTimeTicks === 'number' ? body.StartTimeTicks : 0;

  // A client that named a track gets that track; otherwise the Server chooses,
  // which is what the User's own configuration is for.
  const audioIndex =
    typeof body.AudioStreamIndex === 'number'
      ? body.AudioStreamIndex
      : chosenAudioIndex(item, configuration);
  const subtitleIndex =
    typeof body.SubtitleStreamIndex === 'number'
      ? body.SubtitleStreamIndex
      : chosenSubtitleIndex(item, configuration, audioIndex);

  return {
    Id: mediaSourceIdFor(item.Id),
    Name: item.Name,
    Container: media.Container,
    Protocol: 'File',
    SupportsDirectPlay: direct,
    SupportsDirectStream: direct,
    SupportsTranscoding: true,
    RunTimeTicks: item.RunTimeTicks ?? null,
    MediaStreams: item.MediaStreams ?? [],
    DefaultAudioStreamIndex: audioIndex,
    DefaultSubtitleStreamIndex: subtitleIndex,
    // #31: whether this Server's detection plugin found anything on this item.
    // It is what tells a client it is worth asking `/MediaSegments` at all.
    HasSegments: segments.length > 0,
    // Already parameterised and already carrying its own ApiKey, exactly as the
    // real Server's is, so a client that rebuilds it is doing it wrong.
    TranscodingUrl: direct
      ? null
      : transcodingUrlFor(item.Id, subProtocol, startTicks, token),
    TranscodingSubProtocol: direct ? null : subProtocol,
    TranscodingContainer: direct ? null : subProtocol === 'hls' ? 'ts' : 'mp4',
    // The fake holds no stream indexes of its own; this is where a later ticket
    // would seed them.
    RequiredHttpHeaders: {},
  };
}

/**
 * Whether the device said, in its own profile, that it plays this file as it is:
 * the container, the video codec, the audio codec where there is one, and a
 * picture no taller than any required height condition.
 */
function directPlayAllowed(media: FakeMediaFile, profile: Record<string, unknown>): boolean {
  const entries = Array.isArray(profile.DirectPlayProfiles) ? profile.DirectPlayProfiles : [];
  const plays = entries.some((entry) => {
    if (!isObject(entry)) return false;
    if (entry.Type !== 'Video') return false;
    if (!listed(entry.Container, media.Container)) return false;
    if (!listed(entry.VideoCodec, media.VideoCodec)) return false;
    if (media.AudioCodec === undefined) return true;
    return listed(entry.AudioCodec, media.AudioCodec);
  });
  if (!plays) return false;

  return withinHeightConditions(media, profile);
}

function withinHeightConditions(
  media: FakeMediaFile,
  profile: Record<string, unknown>,
): boolean {
  const codecProfiles = Array.isArray(profile.CodecProfiles) ? profile.CodecProfiles : [];
  for (const entry of codecProfiles) {
    if (!isObject(entry)) continue;
    const conditions = Array.isArray(entry.Conditions) ? entry.Conditions : [];
    for (const condition of conditions) {
      if (!isObject(condition)) continue;
      if (condition.Property !== 'Height') continue;
      if (condition.IsRequired !== true) continue;
      if (condition.Condition !== 'LessThanEqual') continue;
      if (media.Height > Number(condition.Value)) return false;
    }
  }
  return true;
}

/** Whether the device offered an HLS transcode, which decides the sub-protocol. */
function hlsWanted(profile: Record<string, unknown>): boolean {
  const entries = Array.isArray(profile.TranscodingProfiles) ? profile.TranscodingProfiles : [];
  return entries.some((entry) => isObject(entry) && entry.Protocol === 'hls');
}

/**
 * A transcoding URL shaped like the Server's own: server-relative, fully
 * parameterised, and already carrying the token.
 */
function transcodingUrlFor(
  itemId: string,
  subProtocol: 'hls' | 'http',
  startTicks: number,
  token: string,
): string {
  const common = [
    `mediaSourceId=${mediaSourceIdFor(itemId)}`,
    `playSessionId=${playSessionFor(itemId)}`,
    'videoCodec=h264',
    'audioCodec=aac',
    `startTimeTicks=${String(startTicks)}`,
    `ApiKey=${token}`,
  ].join('&');

  return subProtocol === 'hls'
    ? `/Videos/${itemId}/master.m3u8?${common}`
    : `/Videos/${itemId}/stream.mp4?${common}`;
}

/**
 * Which tracks the Server starts a Title with (#27).
 *
 * **This is the Server's job, and that is the point of it being here.** A
 * Jellyfin server applies `AudioLanguagePreference`,
 * `SubtitleLanguagePreference` and `SubtitleMode` from the User's
 * `UserConfiguration` when it answers `PlaybackInfo`, so every Jellyfin app
 * starts the same Title with the same tracks without implementing the rule.
 * Modelling it here is what lets a test prove Jellyflick reads the Server's
 * answer rather than matching languages a second time in the client — a client
 * that did would pass against a fake that always said "the first one".
 *
 * The rule is a faithful subset, not the whole of the real one, and the ways it
 * is smaller are deliberate: `Smart` is approximated as "subtitles when the
 * sound is not already in the preferred language", and the real Server's
 * further tie-breaks (hearing-impaired tracks, external before embedded,
 * per-Series remembered selections) are not modelled because nothing in this
 * app reads them yet. Whoever needs one grows it here.
 *
 * An index returned is the stream's **own** `Index`, never its place in
 * `MediaStreams`, which is what the real wire value is.
 */
function chosenAudioIndex(item: FakeItem, configuration: FakeUserConfiguration): number | null {
  const audio = streamsOfType(item, 'Audio');
  if (audio.length === 0) return null;

  const preferred = languageOf(configuration.AudioLanguagePreference);
  const wanted =
    preferred === undefined
      ? undefined
      : audio.find((stream) => stream.Language === preferred);

  const chosen = wanted ?? audio.find((stream) => stream.IsDefault === true) ?? audio[0];
  return chosen?.Index ?? null;
}

function chosenSubtitleIndex(
  item: FakeItem,
  configuration: FakeUserConfiguration,
  audioIndex: number | null,
): number | null {
  const subtitles = streamsOfType(item, 'Subtitle');
  if (subtitles.length === 0) return null;

  const mode = configuration.SubtitleMode ?? 'Default';
  const preferred = languageOf(configuration.SubtitleLanguagePreference);
  const inPreferred =
    preferred === undefined
      ? undefined
      : subtitles.find((stream) => stream.Language === preferred);
  const forced = subtitles.find((stream) => stream.IsForced === true);

  switch (mode) {
    case 'None':
      return null;
    case 'OnlyForced':
      return forced?.Index ?? null;
    case 'Always':
      return (inPreferred ?? subtitles[0])?.Index ?? null;
    case 'Smart': {
      // The sound is already in the language they read: nothing to show.
      const audio = streamsOfType(item, 'Audio').find((stream) => stream.Index === audioIndex);
      if (preferred !== undefined && audio?.Language === preferred) return null;
      return (inPreferred ?? forced)?.Index ?? null;
    }
    default:
      // `Default`: whatever the *file* was marked with, and nothing otherwise.
      return (forced ?? subtitles.find((stream) => stream.IsDefault === true))?.Index ?? null;
  }
}

function streamsOfType(item: FakeItem, type: 'Audio' | 'Subtitle'): FakeMediaStream[] {
  return (item.MediaStreams ?? []).filter((stream) => stream.Type === type);
}

/** A preference the Server stores as `''` or null means "no preference". */
function languageOf(value: string | null | undefined): string | undefined {
  return typeof value === 'string' && value !== '' ? value : undefined;
}

/** Whether a comma-separated profile field names a value. Empty means "any". */
function listed(field: unknown, value: string): boolean {
  if (typeof field !== 'string' || field === '') return true;
  return field
    .split(',')
    .map((entry) => entry.trim().toLowerCase())
    .includes(value.toLowerCase());
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
