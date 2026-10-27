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

/**
 * The profile for one of the device layer's own capability profiles. Both
 * halves come from the same named device, because an image subtitle's fate
 * depends on the device's subtitle capabilities and its container list on the
 * video ones — a profile built from two different devices is not a device.
 */
function profileFor(name: keyof typeof CAPABILITY_PROFILES) {
  const profile = CAPABILITY_PROFILES[name];
  return deviceProfileFor(profile.video, profile.subtitles);
}

describe('the DeviceProfile sent to the Server', () => {
  it('offers direct play of every container the device plays, with its codecs', () => {
    const profile = profileFor('modern-desktop-browser');

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
    const profile = profileFor('webos-5-like');

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
    const profile = profileFor('phone-safari');

    expect(profile.TranscodingProfiles.some((entry) => entry.Protocol === 'hls')).toBe(true);
  });

  it('asks only for a progressive transcode where the device can play neither', () => {
    const profile = deviceProfileFor(PLAIN_VIDEO_TAG, CAPABILITY_PROFILES['webos-5-like'].subtitles);

    expect(profile.TranscodingProfiles.map((entry) => entry.Protocol)).toEqual(['http']);
    expect(profile.TranscodingProfiles[0]?.Container).toBe('mp4');
  });

  it('never leaves a device with no way to be transcoded to at all', () => {
    for (const named of Object.values(CAPABILITY_PROFILES)) {
      expect(deviceProfileFor(named.video, named.subtitles).TranscodingProfiles.length).toBeGreaterThan(0);
    }
  });

  it("holds the Server to the tallest picture the device will decode", () => {
    const profile = profileFor('phone-safari');

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
    const profile = profileFor('modern-desktop-browser');

    // `jellyfin-playback.md` §14: only `External` can carry a Subtitle Offset.
    expect(profile.SubtitleProfiles.map((entry) => entry.Format)).toEqual([
      'vtt',
      'srt',
      'ass',
      'ssa',
      // PGS, which this device can draw (#30) — see the group below.
      'pgssub',
      'hdmv_pgs_subtitle',
      'sup',
    ]);
    for (const entry of profile.SubtitleProfiles) {
      expect(entry.Method).toBe('External');
    }
  });

  /**
   * Image subtitles (#30), which is the whole of how burn-in is *asked for*.
   *
   * The Server decides per track: `StreamBuilder.GetSubtitleProfile` matches
   * a declared `SubtitleProfile.Format` against the stream's own `Codec`,
   * case-insensitively and exactly, and falls back to
   * `SubtitleDeliveryMethod.Encode` — burning the words into the picture —
   * when nothing matches. So a format left out of this list *is* the request
   * to burn it in, and there is no flag to set.
   */
  describe('image subtitles, declared only where the device can draw them', () => {
    it('claims every codec name PGS is really seen under, so the raw file is sent', () => {
      const formats = profileFor('modern-desktop-browser').SubtitleProfiles.map(
        (entry) => entry.Format,
      );

      // §14's table of the codec values a real Server reports for PGS. The
      // Server compares `Format` to `Codec` exactly, so one spelling is not
      // enough — a track reported as `sup` would be burned in regardless.
      expect(formats).toContain('pgssub');
      expect(formats).toContain('hdmv_pgs_subtitle');
      expect(formats).toContain('sup');
    });

    it('claims no image format at all on a device that cannot draw one', () => {
      const formats = profileFor('webos-5-like').SubtitleProfiles.map((entry) => entry.Format);

      expect(formats).toEqual(['vtt', 'srt', 'ass', 'ssa']);
    });

    /**
     * VobSub and DVB are never claimed, on any device: the finding on #30 is
     * that no client-side renderer exists and that Jellyfin will not hand over
     * a VobSub `.idx` even if one did. Claiming them would be asking for a
     * file this app cannot draw and losing the burn-in it needs.
     */
    it('never claims VobSub or DVB, even on the device that draws PGS', () => {
      const formats = profileFor('modern-desktop-browser').SubtitleProfiles.map(
        (entry) => entry.Format,
      );

      for (const format of ['vobsub', 'dvdsub', 'dvd_subtitle', 'sub', 'dvbsub', 'dvb_subtitle']) {
        expect(formats).not.toContain(format);
      }
    });
  });

  it('asks for more bitrate from a device that will decode a taller picture', () => {
    const tall = profileFor('webos-5-like');
    const short = profileFor('phone-safari');

    expect(tall.MaxStreamingBitrate).toBeGreaterThan(short.MaxStreamingBitrate);
  });
});
