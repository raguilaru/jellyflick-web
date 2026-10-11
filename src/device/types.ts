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

/**
 * The shape of device this is, as far as how a User drives it goes.
 *
 * - `tv` — across a room, with a remote: no pointer, nothing to touch, and no
 *   keyboard worth typing a password on. This is what makes Quick Connect the
 *   way in rather than an alternative to it (#9).
 * - `handheld` — a phone or a tablet: touch, and an on-screen keyboard.
 * - `computer` — a mouse or a trackpad and a real keyboard.
 *
 * It is a fact about the device, deliberately not a policy: which sign-in a
 * screen offers first is the screen's to decide from this, so a later ticket
 * can read the same fact for its own reasons without inheriting #9's answer.
 */
export type DeviceForm = 'tv' | 'handheld' | 'computer';

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

/**
 * Durable key/value storage on this device, holding what must survive a reload:
 * the Server address, and each signed-in User's token and DeviceId.
 *
 * It is part of the device layer because it is the device that provides it, and
 * because a browser can refuse it outright — a private window, or site data
 * blocked. An implementation that cannot store anything still answers every
 * call, so a User who cannot be remembered simply signs in again.
 */
export type DeviceStorage = {
  read(key: string): string | undefined;
  write(key: string, value: string): void;
  remove(key: string): void;
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

  /**
   * The languages this device prefers, best first, as BCP 47 tags. It is what
   * the app's language falls back to when the User has not chosen one
   * (story 113), and it is here because it is `navigator.languages` — which
   * nothing outside this folder may read.
   */
  preferredLanguages(): readonly string[];

  /**
   * What shape of device this is. Read it rather than asking `navigator` or
   * `matchMedia` at a call site: the webOS port answers `tv` outright, and
   * nothing outside this folder may read the user agent at all.
   */
  deviceForm(): DeviceForm;

  /** Maps a keyboard or remote-control event onto a logical key. */
  keyFor(event: Pick<KeyboardEvent, 'key' | 'keyCode'>): DeviceKey;

  /** Device storage. The same instance every call. */
  storage(): DeviceStorage;

  videoCapabilities(): VideoCapabilities;
  subtitleCapabilities(): SubtitleCapabilities;
  playbackTargets(): PlaybackTargets;

  /** Milliseconds since the epoch. Injected so tests can fix the clock. */
  now(): number;
  /** A number in [0, 1). Injected so Spotlight's pick is testable. */
  random(): number;
};
