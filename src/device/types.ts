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

/**
 * A loaded styled-subtitle renderer: libass, compiled to WebAssembly, drawing
 * an ASS file's own fonts, colours and positions onto a canvas over the
 * picture (#29).
 *
 * It is **two methods wide on purpose.** Everything else such a library offers
 * — fonts, scaling, colour spaces, the worker it runs in — is settled when it
 * is created, so what is left is the one thing that changes while a User
 * watches (the Subtitle Offset) and the one thing that has to happen when they
 * stop. A narrow seam is what lets the webOS port answer it with a different
 * library (`decisions.md` §8) without anything above noticing.
 */
export type SubtitleRenderer = {
  /**
   * Shift the subtitles, in seconds, positive for later (#28). It is the same
   * number the app-drawn overlay subtracts from the element's position, and
   * every library this seam is answered with takes one: libass has
   * `timeOffset`, and so does `libpgs` for #30
   * (`player-subtitles.md` §6a and §6b).
   */
  setTimeOffset(seconds: number): void;
  /** Stop, free the worker and the WASM heap, and take the drawing away. */
  destroy(): void;
};

export type StyledSubtitleRenderer = SubtitleRenderer;

/**
 * A loaded image-subtitle renderer: `libpgs`, decoding a PGS bitmap stream and
 * drawing it onto a canvas over the picture (#30).
 *
 * **It is the same two methods as the styled one, and that is a finding rather
 * than a coincidence.** #29 cut that seam at `setTimeOffset` and `destroy`
 * because they are the one thing that changes while a User watches and the one
 * thing owed on unmount; a second library, chosen a ticket later for an
 * unrelated format, turned out to need neither more nor less. So the two alias
 * one type, and the player's two canvas overlays are the same shape to
 * everything above them.
 */
export type ImageSubtitleRenderer = SubtitleRenderer;

export type StyledSubtitleRendererOptions = {
  /** The element whose picture the subtitles are drawn over and timed against. */
  readonly video: HTMLVideoElement;
  /** The canvas to draw on, already sized and positioned by the caller. */
  readonly canvas: HTMLCanvasElement;
  /** The ASS or SSA file itself, as text. */
  readonly content: string;
  /**
   * The embedded fonts the file names, as URLs for the renderer to fetch
   * itself — in its worker, which is where it wants them (#29).
   */
  readonly fontUrls: readonly string[];
  /** The Subtitle Offset in force when it starts, so it opens already shifted. */
  readonly timeOffset: number;
};

export type ImageSubtitleRendererOptions = {
  /** The element whose picture the subtitles are drawn over and timed against. */
  readonly video: HTMLVideoElement;
  /** The canvas to draw on, already sized and positioned by the caller. */
  readonly canvas: HTMLCanvasElement;
  /**
   * The PGS stream's **address**, not its bytes, and that is the one way this
   * differs from the styled options above.
   *
   * A `.sup` is a sequence of binary display sets rather than a text file, and
   * `libpgs` would rather fetch it in the worker that decodes it — the same
   * trade #29's embedded fonts make. Handing over a URL keeps a stream that
   * can run to several megabytes of run-length-encoded bitmaps off the main
   * thread entirely, and the token rides in the query as `ApiKey` for the same
   * reason the video's and the attachments' do: nothing else can send a header
   * for a fetch this app does not make.
   */
  readonly subtitleUrl: string;
  /** The Subtitle Offset in force when it starts, so it opens already shifted. */
  readonly timeOffset: number;
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

  /**
   * Load the styled-subtitle renderer this device can use, and start it on
   * the file it is given (#29).
   *
   * **It is the device layer's because the answer differs per device**, which
   * is `decisions.md` §8: JASSUB on the web, libass-wasm on the TV — the only
   * one that runs on Chromium 68 — and the capability gate in
   * `subtitleCapabilities().canRenderStyled` is what says whether to ask at
   * all. Putting the choice here rather than at the call site is also what
   * keeps `typeof OffscreenCanvas` out of `src/playback/`, the same rule that
   * keeps `navigator` out of it.
   *
   * **It is a promise because the loading is lazy.** A libass build is a
   * couple of megabytes of WebAssembly, and nobody watching a film with plain
   * subtitles — or none — should download it. The `import()` that fetches it
   * happens inside this call, so it happens the first time a User chooses a
   * styled track and never otherwise.
   *
   * It **rejects** when the renderer cannot be had: a device whose capability
   * said yes but whose engine would not load, a network that dropped the
   * chunk, a WASM binary the engine refused. The caller falls back to drawing
   * the words (`flattenAss`), because a User who asked for subtitles is owed
   * the words far more than the styling.
   */
  loadStyledSubtitleRenderer(
    options: StyledSubtitleRendererOptions,
  ): Promise<StyledSubtitleRenderer>;

  /**
   * Load the image-subtitle renderer this device can use, and start it on the
   * PGS stream it is given (#30).
   *
   * The sibling of `loadStyledSubtitleRenderer`, here for the same three
   * reasons and one more of its own.
   *
   * **Lazy**, so the decoder is in a chunk nobody fetches until a User picks a
   * PGS track — the ticket's second acceptance criterion, and the reason this
   * is a `Promise` rather than a constructor.
   *
   * **The device layer's**, because the engine is a device question and
   * because `libpgs` has to be told which of its three modes to run in, which
   * is `typeof OffscreenCanvas` — exactly what `src/device/` exists to keep
   * out of `src/playback/`. Nothing may import `image-subtitle-renderer.ts`
   * statically.
   *
   * **Gated** by `subtitleCapabilities().canRenderImage`, which is also what
   * the DeviceProfile claims PGS on: a device that asks for the stream and a
   * device that told the Server not to burn it in have to be the same device,
   * or a User gets a picture with the words in it *and* a decoder drawing them
   * again on top.
   *
   * **And it rejects** rather than returning something that draws nothing,
   * like #29's — but the fallback differs, and that is the one of its own. A
   * styled track that cannot be styled still has words to draw; a PGS track
   * that cannot be decoded has nothing underneath it, because the bitmap *is*
   * the subtitle. So the caller has no second renderer to reach for and says
   * so beside the picture instead.
   */
  loadImageSubtitleRenderer(
    options: ImageSubtitleRendererOptions,
  ): Promise<ImageSubtitleRenderer>;

  /** Milliseconds since the epoch. Injected so tests can fix the clock. */
  now(): number;
  /** A number in [0, 1). Injected so Spotlight's pick is testable. */
  random(): number;
};
