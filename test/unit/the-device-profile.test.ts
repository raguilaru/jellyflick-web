import { describe, expect, it } from 'vitest';
import { deviceProfileFor } from '../../src/playback/device-profile';
import type { VideoCapabilities } from '../../src/device/types';
import { CAPABILITY_PROFILES } from '../device/profiles';

/**
 * The DeviceProfile Jellyflick sends to `POST /Items/{id}/PlaybackInfo`: the one
 * thing that decides whether the Server hands back the file itself or a
 * transcode, so it is the one thing worth pinning per device class.
 *
 * The expected values are read off the device layer's own capability profiles
 * and off `jellyfin-playback.md` §9 — never recomputed the way the code does.
 */

/** A device that can play nothing at all through a Media Source or HLS. */
const PLAIN_VIDEO_TAG: VideoCapabilities = {
  containers: ['mp4'],
  videoCodecs: ['h264'],
  audioCodecs: ['aac'],
  maxHeight: 1080,
  playsHlsNatively: false,
  hasMediaSource: false,
};

describe('the DeviceProfile sent to the Server', () => {
  it('offers direct play of every container the device plays, with its codecs', () => {
    const profile = deviceProfileFor(CAPABILITY_PROFILES['modern-desktop-browser'].video);

    // One entry per container, because Jellyfin matches a source's container
    // first and its codecs second.
    expect(profile.DirectPlayProfiles.map((entry) => entry.Container)).toEqual([
      'mp4',
      'webm',
      'mkv',
    ]);
    for (const entry of profile.DirectPlayProfiles) {
      expect(entry.Type).toBe('Video');
      // Comma-separated strings, not arrays: `jellyfin-playback.md` §9.
      expect(entry.VideoCodec).toBe('h264,vp8,vp9,av1');
      expect(entry.AudioCodec).toBe('aac,mp3,opus,flac');
    }
  });

  it('asks for an HLS transcode where there is a Media Source to play it with', () => {
    const profile = deviceProfileFor(CAPABILITY_PROFILES['webos-5-like'].video);

    const hls = profile.TranscodingProfiles.filter((entry) => entry.Protocol === 'hls');
    expect(hls).toHaveLength(1);
    expect(hls[0]?.Container).toBe('ts');
    expect(hls[0]?.Type).toBe('Video');
    expect(hls[0]?.Context).toBe('Streaming');
    // A transcode is only worth asking for in codecs every target decodes.
    expect(hls[0]?.VideoCodec).toBe('h264');
    expect(hls[0]?.AudioCodec).toBe('aac');
  });

  it('asks for an HLS transcode where the device plays a playlist with no library', () => {
    const profile = deviceProfileFor(CAPABILITY_PROFILES['phone-safari'].video);

    expect(profile.TranscodingProfiles.some((entry) => entry.Protocol === 'hls')).toBe(true);
  });

  it('asks only for a progressive transcode where the device can play neither', () => {
    const profile = deviceProfileFor(PLAIN_VIDEO_TAG);

    expect(profile.TranscodingProfiles.map((entry) => entry.Protocol)).toEqual(['http']);
    expect(profile.TranscodingProfiles[0]?.Container).toBe('mp4');
  });

  it('never leaves a device with no way to be transcoded to at all', () => {
    for (const named of Object.values(CAPABILITY_PROFILES)) {
      expect(deviceProfileFor(named.video).TranscodingProfiles.length).toBeGreaterThan(0);
    }
  });

  it("holds the Server to the tallest picture the device will decode", () => {
    const profile = deviceProfileFor(CAPABILITY_PROFILES['phone-safari'].video);

    const heights = profile.CodecProfiles.flatMap((entry) =>
      (entry.Conditions ?? []).filter((condition) => condition.Property === 'Height'),
    );
    expect(heights).toHaveLength(1);
    expect(heights[0]?.Condition).toBe('LessThanEqual');
    expect(heights[0]?.Value).toBe('1080');
    // Jellyfin only applies a condition it is allowed to transcode for.
    expect(heights[0]?.IsRequired).toBe(true);
  });

  it('asks for subtitles as separate files, which is the only shiftable kind', () => {
    const profile = deviceProfileFor(CAPABILITY_PROFILES['modern-desktop-browser'].video);

    // `jellyfin-playback.md` §14: only `External` can carry a Subtitle Offset.
    expect(profile.SubtitleProfiles.map((entry) => entry.Format)).toEqual([
      'vtt',
      'srt',
      'ass',
      'ssa',
    ]);
    for (const entry of profile.SubtitleProfiles) {
      expect(entry.Method).toBe('External');
    }
  });

  it('asks for more bitrate from a device that will decode a taller picture', () => {
    const tall = deviceProfileFor(CAPABILITY_PROFILES['webos-5-like'].video);
    const short = deviceProfileFor(CAPABILITY_PROFILES['phone-safari'].video);

    expect(tall.MaxStreamingBitrate).toBeGreaterThan(short.MaxStreamingBitrate);
  });
});
