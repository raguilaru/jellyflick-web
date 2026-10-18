/**
 * Fixed device layers for tests: a fixed clock, a fixed sequence of random
 * numbers and counted DeviceIds, plus one capability profile per device class
 * the project cares about.
 *
 * These replace the device layer, which is a system boundary. They never
 * replace anything of ours.
 */
import type {
  DeviceForm,
  DeviceLayer,
  DeviceStorage,
  PlaybackTargets,
  StyledSubtitleRenderer,
  StyledSubtitleRendererOptions,
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
  /**
   * Device storage. Pass the same instance to two device layers to model a
   * reload: the page is new, the storage is the one the device already had.
   */
  storage?: DeviceStorage;
  /**
   * The languages the device prefers, best first. English by default, so a
   * test that says nothing about language gets the English dictionary.
   */
  preferredLanguages?: readonly string[];
  /**
   * The styled-subtitle renderer this device loads (#29). It stands in for
   * libass compiled to WebAssembly, which is a system boundary like the rest
   * of this file — no test runs a 2 MB WASM binary in happy-dom, and nothing
   * in this project reads what libass draws.
   *
   * Pass `styledRendererFails` to model the case the fallback exists for: a
   * device that said it could draw the styling and then could not load the
   * engine.
   */
  styledRenderer?: FakeStyledRenderer;
};

/**
 * The fake styled-subtitle renderer, and the record of what was asked of it.
 *
 * It records rather than draws, because what a test can meaningfully assert is
 * the *contract*: that it was started with the file and the fonts, that the
 * Subtitle Offset reached it, and that it was destroyed. What libass makes of
 * the file afterwards is libass's business and a real browser's — the e2e
 * suite is where a real one runs.
 */
export type FakeStyledRenderer = {
  /** One entry per renderer started, in order. */
  readonly started: StyledSubtitleRendererOptions[];
  /** Every offset handed to a live renderer, in order. */
  readonly offsets: number[];
  /** How many renderers were destroyed. */
  destroyed: number;
  /** Set to make loading reject, which is what the fallback is for. */
  failing: boolean;
};

export function fakeStyledRenderer(options: { failing?: boolean } = {}): FakeStyledRenderer {
  return {
    started: [],
    offsets: [],
    destroyed: 0,
    failing: options.failing ?? false,
  };
}

/** 2026-06-15T12:00:00Z — a fixed instant, so date-derived behaviour is stable. */
export const FIXED_NOW = Date.UTC(2026, 5, 15, 12, 0, 0);

let deviceLayerCount = 0;

/**
 * Device storage that keeps values in a Map. Hold one across two device layers
 * to model a reload; make a fresh one to model a different device.
 */
export function inMemoryDeviceStorage(
  seed: Readonly<Record<string, string>> = {},
): DeviceStorage {
  const values = new Map<string, string>(Object.entries(seed));
  return {
    read: (key) => values.get(key),
    write: (key, value) => {
      values.set(key, value);
    },
    remove: (key) => {
      values.delete(key);
    },
  };
}

export function testDeviceLayer(options: TestDeviceOptions = {}): DeviceLayer {
  const profileName = options.profile ?? 'modern-desktop-browser';
  const profile = CAPABILITY_PROFILES[profileName];
  const randomSequence = options.randomSequence ?? [0.5];
  const storage = options.storage ?? inMemoryDeviceStorage();
  // One per device layer, for a test that does not care to look at it.
  const styledRenderer = fakeStyledRenderer();
  let randomIndex = 0;
  let deviceIdCount = 0;
  // Unique per device layer as well as per call, so two device layers in one
  // test never mint the same DeviceId — the Server allows one token per id.
  const deviceIdPrefix = `test-device-${String((deviceLayerCount += 1))}`;

  return {
    name: `test:${profileName}`,
    deviceName: () => profile.deviceName,
    deviceForm: () => profile.form,
    preferredLanguages: () => options.preferredLanguages ?? ['en'],
    newDeviceId: () => {
      deviceIdCount += 1;
      return `${deviceIdPrefix}-${String(deviceIdCount)}`;
    },
    storage: () => storage,
    // Key mapping has one correct answer on every device, so the real one is
    // used rather than a second copy that could drift from it.
    keyFor: createBrowserDeviceLayer().keyFor,
    videoCapabilities: () => profile.video,
    subtitleCapabilities: () => profile.subtitles,
    playbackTargets: () => profile.targets,

    loadStyledSubtitleRenderer: (rendererOptions) => {
      const record = options.styledRenderer ?? styledRenderer;
      if (record.failing) {
        return Promise.reject(new Error('The test device layer cannot load a styled renderer.'));
      }
      record.started.push(rendererOptions);
      record.offsets.push(rendererOptions.timeOffset);
      return Promise.resolve<StyledSubtitleRenderer>({
        setTimeOffset: (seconds) => {
          record.offsets.push(seconds);
        },
        destroy: () => {
          record.destroyed += 1;
        },
      });
    },
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
  /**
   * What a User drives this class of device with. It is what decides whether
   * Quick Connect is offered before a password (#9), so it is part of the
   * profile rather than something a test sets by hand.
   */
  form: DeviceForm;
  video: VideoCapabilities;
  subtitles: SubtitleCapabilities;
  targets: PlaybackTargets;
};

export const CAPABILITY_PROFILES: Readonly<Record<CapabilityProfileName, CapabilityProfile>> = {
  'modern-desktop-browser': {
    deviceName: 'Test Desktop Browser',
    form: 'computer',
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
    form: 'handheld',
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
    form: 'tv',
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
