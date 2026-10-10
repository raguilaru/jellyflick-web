/**
 * Fixed device layers for tests: a fixed clock, a fixed sequence of random
 * numbers and counted DeviceIds, plus one capability profile per device class
 * the project cares about.
 *
 * These replace the device layer, which is a system boundary. They never
 * replace anything of ours.
 */
import type {
  DeviceLayer,
  PlaybackTargets,
  SubtitleCapabilities,
  VideoCapabilities,
} from '../../src/device/types';
import { createBrowserDeviceLayer } from '../../src/device/browser';

export type CapabilityProfileName = 'modern-desktop-browser' | 'phone-safari' | 'webos-5-like';

export type TestDeviceOptions = {
  profile?: CapabilityProfileName;
  /** Milliseconds since the epoch that `now()` returns. Fixed, never advancing. */
  now?: number;
  /** Returned by `random()` in order, then repeated from the start. */
  randomSequence?: readonly number[];
};

/** 2026-06-15T12:00:00Z — a fixed instant, so date-derived behaviour is stable. */
export const FIXED_NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

export function testDeviceLayer(options: TestDeviceOptions = {}): DeviceLayer {
  const profileName = options.profile ?? 'modern-desktop-browser';
  const profile = CAPABILITY_PROFILES[profileName];
  const randomSequence = options.randomSequence ?? [0.5];
  let randomIndex = 0;
  let deviceIdCount = 0;

  return {
    name: `test:${profileName}`,
    deviceName: () => profile.deviceName,
    newDeviceId: () => {
      deviceIdCount += 1;
      return `test-device-${String(deviceIdCount)}`;
    },
    // Key mapping has one correct answer on every device, so the real one is
    // used rather than a second copy that could drift from it.
    keyFor: createBrowserDeviceLayer().keyFor,
    videoCapabilities: () => profile.video,
    subtitleCapabilities: () => profile.subtitles,
    playbackTargets: () => profile.targets,
    now: () => options.now ?? FIXED_NOW,
    random: () => {
      const value = randomSequence[randomIndex % randomSequence.length] as number;
      randomIndex += 1;
      return value;
    },
  };
}

type CapabilityProfile = {
  deviceName: string;
  video: VideoCapabilities;
  subtitles: SubtitleCapabilities;
  targets: PlaybackTargets;
};

export const CAPABILITY_PROFILES: Readonly<Record<CapabilityProfileName, CapabilityProfile>> = {
  'modern-desktop-browser': {
    deviceName: 'Test Desktop Browser',
    video: {
      containers: ['mp4', 'webm', 'mkv'],
      videoCodecs: ['h264', 'vp8', 'vp9', 'av1'],
      audioCodecs: ['aac', 'mp3', 'opus', 'flac'],
      maxHeight: 2160,
      playsHlsNatively: false,
      hasMediaSource: true,
    },
    subtitles: { canRenderText: true, canRenderStyled: true, canRenderImage: true },
    targets: { cast: true, airPlay: false, pictureInPicture: true },
  },

  'phone-safari': {
    deviceName: 'Test Phone Safari',
    video: {
      containers: ['mp4'],
      videoCodecs: ['h264', 'hevc'],
      audioCodecs: ['aac', 'mp3', 'ac3', 'eac3'],
      maxHeight: 1080,
      playsHlsNatively: true,
      hasMediaSource: false,
    },
    subtitles: { canRenderText: true, canRenderStyled: true, canRenderImage: true },
    targets: { cast: false, airPlay: true, pictureInPicture: true },
  },

  /**
   * The Chromium 68 floor: no styled or image subtitle rendering, and no
   * picture-in-picture, which is Chrome 69.
   */
  'webos-5-like': {
    deviceName: 'Test TV',
    video: {
      containers: ['mp4', 'mkv'],
      videoCodecs: ['h264', 'hevc'],
      audioCodecs: ['aac', 'mp3', 'ac3', 'eac3'],
      maxHeight: 2160,
      playsHlsNatively: false,
      hasMediaSource: true,
    },
    subtitles: { canRenderText: true, canRenderStyled: false, canRenderImage: false },
    targets: { cast: false, airPlay: false, pictureInPicture: false },
  },
};
