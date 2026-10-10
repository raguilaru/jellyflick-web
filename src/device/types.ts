/**
 * The device layer: the one interface behind which everything device-specific
 * sits. A browser implementation ships now (`browser.ts`); the LG webOS port
 * will add another, and tests supply fixed ones. Nothing outside this folder
 * may read `navigator`, `window.chrome`, `Date.now()` or `Math.random()`.
 */

/** A logical key, so the rest of the app never reads raw key codes. */
export type DeviceKey =
  | 'Up'
  | 'Down'
  | 'Left'
  | 'Right'
  | 'Enter'
  | 'Back'
  | 'Play'
  | 'Pause'
  | 'PlayPause'
  | 'Stop'
  | 'FastForward'
  | 'Rewind'
  | 'Unknown';

/** What the device can play, which becomes the Jellyfin DeviceProfile. */
export type VideoCapabilities = {
  /** Container formats the device plays directly, e.g. `mp4`, `webm`. */
  readonly containers: readonly string[];
  readonly videoCodecs: readonly string[];
  readonly audioCodecs: readonly string[];
  /** Tallest picture the device will decode, in pixels. */
  readonly maxHeight: number;
  /** The device plays an HLS playlist from a `<video src>` with no library. */
  readonly playsHlsNatively: boolean;
  /** Media Source Extensions are available, so hls.js can be used. */
  readonly hasMediaSource: boolean;
};

/** Which subtitle kinds the device can draw, which picks the renderer. */
export type SubtitleCapabilities = {
  /** Plain text (SRT/VTT) drawn by the app. Always true: the common case. */
  readonly canRenderText: boolean;
  /** Styled subtitles (ASS/SSA) with their styling, through a loaded renderer. */
  readonly canRenderStyled: boolean;
  /** Image subtitles (PGS) drawn client-side, so the offset still applies. */
  readonly canRenderImage: boolean;
};

/** Where playback can be sent, or windowed, on this device. */
export type PlaybackTargets = {
  readonly cast: boolean;
  readonly airPlay: boolean;
  readonly pictureInPicture: boolean;
};

export type DeviceLayer = {
  /** Identifies the implementation in logs and tests, e.g. `browser`. */
  readonly name: string;

  /** The device name reported to the Server in the authorization header. */
  deviceName(): string;
  /**
   * A fresh DeviceId. One per signed-in User, because the Server allows a
   * single token per DeviceId. Lives here because `crypto.randomUUID` is
   * Chrome 92 and the target is Chromium 68.
   */
  newDeviceId(): string;

  /** Maps a keyboard or remote-control event onto a logical key. */
  keyFor(event: Pick<KeyboardEvent, 'key' | 'keyCode'>): DeviceKey;

  videoCapabilities(): VideoCapabilities;
  subtitleCapabilities(): SubtitleCapabilities;
  playbackTargets(): PlaybackTargets;

  /** Milliseconds since the epoch. Injected so tests can fix the clock. */
  now(): number;
  /** A number in [0, 1). Injected so Spotlight's pick is testable. */
  random(): number;
};
