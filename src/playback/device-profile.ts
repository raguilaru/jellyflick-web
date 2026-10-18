import type { SubtitleCapabilities, VideoCapabilities } from '../device/types';

/**
 * The DeviceProfile Jellyflick sends to `POST /Items/{id}/PlaybackInfo`.
 *
 * It is the whole of the negotiation: the Server reads it and decides whether to
 * hand back the file untouched, a remux, or a transcode, so everything the
 * device can and cannot do has to be in it. The facts it is built from all come
 * from the device layer — nothing here reads `navigator` or probes a `<video>`.
 *
 * The shapes are written out rather than imported from `@jellyfin/sdk`, because
 * the SDK's `DeviceProfile` is typed against its generated **enums**
 * (`DlnaProfileType`, `MediaStreamProtocol`, `SubtitleDeliveryMethod`), and ADR
 * 0001 and `decisions.md` §4 allow its types and never its runtime. These are
 * the same field names and the same wire values, from `jellyfin-playback.md` §9.
 */

/** `DlnaProfileType`, of which only video matters to this app. */
export type ProfileMediaType = 'Video';

/** `MediaStreamProtocol`. */
export type StreamProtocol = 'hls' | 'http';

export type DirectPlayProfile = {
  /** Comma-separated, not an array. Jellyfin reads every one of these that way. */
  readonly Container: string;
  readonly VideoCodec: string;
  readonly AudioCodec: string;
  readonly Type: ProfileMediaType;
};

export type TranscodingProfile = {
  readonly Container: string;
  readonly Type: ProfileMediaType;
  readonly VideoCodec: string;
  readonly AudioCodec: string;
  readonly Protocol: StreamProtocol;
  readonly Context: 'Streaming';
  readonly MaxAudioChannels: string;
  readonly MinSegments: number;
  /** Lets the Server cut a segment anywhere, which is what makes seeking quick. */
  readonly BreakOnNonKeyFrames: boolean;
};

export type ProfileCondition = {
  readonly Condition: 'LessThanEqual' | 'EqualsAny' | 'NotEquals';
  readonly Property: 'Height' | 'Width' | 'VideoBitDepth';
  readonly Value: string;
  /**
   * Jellyfin only transcodes to satisfy a condition it is told is required; an
   * optional one it will happily hand back unmet.
   */
  readonly IsRequired: boolean;
};

export type CodecProfile = {
  readonly Type: ProfileMediaType;
  readonly Conditions: readonly ProfileCondition[];
};

export type SubtitleProfile = {
  readonly Format: string;
  /**
   * `SubtitleDeliveryMethod`. `External` is the only one a Subtitle Offset can
   * be applied to (#28), so it is the only one this app declares.
   */
  readonly Method: 'External';
};

export type DeviceProfile = {
  readonly Name: string;
  readonly MaxStreamingBitrate: number;
  readonly MaxStaticBitrate: number;
  readonly DirectPlayProfiles: readonly DirectPlayProfile[];
  readonly TranscodingProfiles: readonly TranscodingProfile[];
  readonly CodecProfiles: readonly CodecProfile[];
  readonly SubtitleProfiles: readonly SubtitleProfile[];
};

/** The name the Server shows this profile under in its own playback logs. */
const PROFILE_NAME = 'Jellyflick';

/**
 * What to ask for over the wire, by how tall a picture the device will decode.
 * Generous enough that a 1080p or 4K source direct-plays rather than being
 * transcoded down for no reason, and finite so a Server on a slow link is not
 * asked for more than the device could use.
 */
const BITRATE_FOR_1080P = 20_000_000;
const BITRATE_FOR_2160P = 60_000_000;
const TALL_PICTURE = 2160;

/**
 * The codecs a transcode is asked for in. Deliberately the narrowest pair every
 * target decodes rather than the device's best: a transcode is the fallback, and
 * asking the Server to spend CPU on HEVC to reach a device that would have
 * direct-played it is the wrong trade.
 */
const TRANSCODE_VIDEO_CODEC = 'h264';
const TRANSCODE_AUDIO_CODEC = 'aac';

/**
 * Stereo. The app has no multi-channel downmix of its own and a browser's is
 * unpredictable, so a transcode is asked for in the channel count every device
 * really has.
 */
const TRANSCODE_AUDIO_CHANNELS = '2';

/**
 * The subtitle formats the app will fetch and draw itself, in preference order.
 * `External` delivery is the point: `jellyfin-playback.md` §14 shows it is the
 * only `SubtitleDeliveryMethod` whose timing a client can shift, which is what
 * the Subtitle Offset (#28) needs. Image formats are deliberately absent, so
 * the Server decides what to do with those rather than this app promising to
 * draw them.
 */
const SUBTITLE_FORMATS: readonly string[] = ['vtt', 'srt', 'ass', 'ssa'];

/**
 * The image formats, declared only by a device that can really draw one (#30).
 *
 * **This list is how burn-in is asked for, and the asking is by omission.**
 * `StreamBuilder.GetSubtitleProfile` matches a declared `Format` against the
 * stream's own `MediaStream.Codec` — exactly, case-insensitively — and falls
 * back to `SubtitleDeliveryMethod.Encode` when nothing matches, which is the
 * Server rendering the words into the picture. There is no flag that requests
 * that; leaving the format out *is* the request.
 *
 * So the entries are **codec names rather than file extensions**, unlike the
 * text formats above, and all three spellings §14 lists are declared: a
 * Server that reports a track as `sup` would burn it in if only `pgssub` were
 * claimed, and the failure would look like a device that cannot draw PGS.
 *
 * **VobSub and DVB are absent on every device**, which is the ticket's own
 * first finding: no maintained client-side renderer exists, and Jellyfin's
 * graphical passthrough hands over a raw PGS payload and never a VobSub
 * `.idx`, so one would be given the bitmaps with no palette to colour them.
 * Claiming them would trade a picture that works for one that does not.
 */
const PGS_CODEC_NAMES: readonly string[] = ['pgssub', 'hdmv_pgs_subtitle', 'sup'];

/**
 * The profile for a device, from what the device layer says it can play.
 *
 * A pure function of the capabilities, so it is the same answer on the same
 * device and a test can hold one device class's profile still.
 */
export function deviceProfileFor(
  capabilities: VideoCapabilities,
  subtitles: SubtitleCapabilities,
): DeviceProfile {
  const videoCodecs = capabilities.videoCodecs.join(',');
  const audioCodecs = capabilities.audioCodecs.join(',');

  return {
    Name: PROFILE_NAME,
    MaxStreamingBitrate: bitrateFor(capabilities),
    // The same ceiling for a file served untouched: this app never asks the
    // Server to pick a lower-quality version of a file it can simply send.
    MaxStaticBitrate: bitrateFor(capabilities),

    // One entry per container. Jellyfin matches a source's container first and
    // its codecs second, so a device that plays h264 in mp4 and nothing else in
    // webm would need two entries — and declaring the codecs per container is
    // how a later device layer could say so without changing this shape.
    DirectPlayProfiles: capabilities.containers.map((container) => ({
      Container: container,
      VideoCodec: videoCodecs,
      AudioCodec: audioCodecs,
      Type: 'Video' as const,
    })),

    TranscodingProfiles: transcodingProfilesFor(capabilities),

    // The one thing worth refusing outright: a picture taller than the device
    // will decode. Everything else is better direct-played than transcoded.
    CodecProfiles: [
      {
        Type: 'Video',
        Conditions: [
          {
            Condition: 'LessThanEqual',
            Property: 'Height',
            Value: String(capabilities.maxHeight),
            IsRequired: true,
          },
        ],
      },
    ],

    SubtitleProfiles: [
      ...SUBTITLE_FORMATS,
      // Declared only where the device can draw a bitmap itself. Left out,
      // the Server burns the track into the picture, which is #30's "the
      // Server burns them in" and the only way to ask for it.
      ...(subtitles.canRenderImage ? PGS_CODEC_NAMES : []),
    ].map((format) => ({
      Format: format,
      Method: 'External' as const,
    })),
  };
}

/**
 * How the device can be transcoded *to*.
 *
 * HLS is asked for wherever there is something to play a playlist with — the
 * device's own player, or a Media Source for hls.js — because it is the only
 * form that seeks well in a live transcode. A progressive mp4 is always offered
 * as well, so a device with neither is never left with no fallback at all; the
 * Server prefers the first profile it can satisfy, and HLS is listed first.
 */
function transcodingProfilesFor(
  capabilities: VideoCapabilities,
): readonly TranscodingProfile[] {
  const progressive: TranscodingProfile = {
    Container: 'mp4',
    Type: 'Video',
    VideoCodec: TRANSCODE_VIDEO_CODEC,
    AudioCodec: TRANSCODE_AUDIO_CODEC,
    Protocol: 'http',
    Context: 'Streaming',
    MaxAudioChannels: TRANSCODE_AUDIO_CHANNELS,
    // Not a segmented form, so neither of the segment settings means anything.
    MinSegments: 0,
    BreakOnNonKeyFrames: false,
  };

  if (!capabilities.playsHlsNatively && !capabilities.hasMediaSource) {
    return [progressive];
  }

  return [
    {
      // MPEG-TS segments: the form every HLS implementation reads, and the one
      // Jellyfin's own transcoder is quickest to produce.
      Container: 'ts',
      Type: 'Video',
      VideoCodec: TRANSCODE_VIDEO_CODEC,
      AudioCodec: TRANSCODE_AUDIO_CODEC,
      Protocol: 'hls',
      Context: 'Streaming',
      MaxAudioChannels: TRANSCODE_AUDIO_CHANNELS,
      // One segment is enough to start, which is what makes Play feel immediate.
      MinSegments: 1,
      BreakOnNonKeyFrames: true,
    },
    progressive,
  ];
}

function bitrateFor(capabilities: VideoCapabilities): number {
  return capabilities.maxHeight >= TALL_PICTURE ? BITRATE_FOR_2160P : BITRATE_FOR_1080P;
}
