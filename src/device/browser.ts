import type {
  DeviceForm,
  DeviceKey,
  DeviceLayer,
  DeviceStorage,
  PlaybackTargets,
  SubtitleCapabilities,
  VideoCapabilities,
} from './types';

/**
 * The device layer for desktop and mobile browsers.
 *
 * Everything here is feature-detected rather than sniffed from the user agent,
 * and nothing assumes an API newer than Chromium 68 exists.
 */
export function createBrowserDeviceLayer(): DeviceLayer {
  const storage = createBrowserStorage();

  return {
    name: 'browser',

    deviceName,
    newDeviceId: () => randomId(),

    deviceForm,

    preferredLanguages,

    keyFor: (event) => keyFor(event),

    storage: () => storage,

    videoCapabilities,
    subtitleCapabilities,
    playbackTargets,

    /**
     * The styled-subtitle renderer (#29), loaded on demand. The `import()` is
     * the lazy half of the ticket's first acceptance criterion: JASSUB, its
     * worker and a couple of megabytes of WebAssembly live in a chunk nobody
     * fetches until a User chooses a styled track. Which engine that is, and
     * whether this browser can really run it, is
     * `styled-subtitle-renderer.ts`'s to answer.
     */
    loadStyledSubtitleRenderer: async (options) => {
      const { createStyledSubtitleRenderer } = await import('./styled-subtitle-renderer');
      return await createStyledSubtitleRenderer(options);
    },

    /**
     * The image-subtitle renderer (#30), loaded on demand, for the same
     * reason and in the same shape as the styled one above: libpgs and its
     * worker live in a chunk nobody fetches until a User chooses a PGS track.
     * It is a far smaller payload than libass — plain JavaScript, no
     * WebAssembly — and it is still lazy, because a User watching with the
     * sound on owes it nothing.
     */
    loadImageSubtitleRenderer: async (options) => {
      const { createImageSubtitleRenderer } = await import('./image-subtitle-renderer');
      return await createImageSubtitleRenderer(options);
    },

    /**
     * The Cast sender (#33), loaded on demand — and of the three lazy loaders
     * here this is the one where "on demand" is not only about weight.
     *
     * The subtitle renderers are chunks of this app's own build, so a User who
     * never needs one has saved a download. This is a `<script>` off
     * `gstatic.com`, and the rest of Jellyflick works against a Server on a
     * LAN with no route to the internet at all: fetching it eagerly would make
     * every such page load ask the outside world for something it cannot have,
     * and `decisions.md` §8 says there is no way to know whether Cast is
     * really available without paying that price. So the `import()` is inside
     * the press, and `playbackTargets().cast` is what decides whether there is
     * a press to make.
     */
    loadCastSender: async (options) => {
      const { createCastSender } = await import('./cast-sender');
      return await createCastSender(options);
    },

    now: () => Date.now(),
    random: () => Math.random(),
  };
}

/**
 * The languages the browser says the User prefers, best first. `languages` is
 * the ordered list and is native on the target; `language` is the one every
 * browser has, and is the fallback for anything that lacks the list.
 */
function preferredLanguages(): readonly string[] {
  const languages = navigator.languages;
  if (Array.isArray(languages) && languages.length > 0) return languages;
  return navigator.language === '' ? [] : [navigator.language];
}

/**
 * What shape of device this is, from what it can do rather than what it calls
 * itself. A smart-TV browser is the device with **no** fine pointer and
 * **no** touch: all it has is a remote, which is why Quick Connect is offered
 * before a password there (#9).
 *
 * `pointer` and `any-pointer` are media features (Chrome 41), not container
 * queries, so ADR 0002 leaves them alone — the same reasoning `useWidePointer`
 * in `src/shell/layout.ts` already relies on. `maxTouchPoints` is `navigator`,
 * which is exactly why this lives here.
 *
 * A device with no `matchMedia` at all is called a `computer`: that is the form
 * whose screen works with every kind of input, so a wrong guess costs a User
 * nothing more than one extra press. The webOS port will not guess — it
 * answers `tv` outright.
 */
function deviceForm(): DeviceForm {
  const touchPoints = navigator.maxTouchPoints;
  const touchable = typeof touchPoints === 'number' && touchPoints > 0;

  if (typeof window.matchMedia !== 'function') return 'computer';
  const hasFinePointer = window.matchMedia('(any-pointer: fine)').matches;

  if (!hasFinePointer && !touchable) return 'tv';
  return touchable && !hasFinePointer ? 'handheld' : 'computer';
}

/**
 * A short, recognisable name for the Server's device list. Feature detection
 * cannot tell browsers apart, so this is the one place the user agent is read,
 * and only for a label.
 */
function deviceName(): string {
  const agent = navigator.userAgent;
  const known: ReadonlyArray<[string, string]> = [
    ['Edg/', 'Edge'],
    ['OPR/', 'Opera'],
    ['Firefox/', 'Firefox'],
    ['Chrome/', 'Chrome'],
    ['Safari/', 'Safari'],
  ];
  for (const [needle, name] of known) {
    if (agent.includes(needle)) return name;
  }
  return 'Browser';
}

/**
 * webOS remotes send their Back key as keyCode 461 with no useful `key`, so both
 * are consulted. `Escape` is the desktop and keyboard equivalent.
 */
const WEBOS_BACK_KEY_CODE = 461;

function keyFor(event: Pick<KeyboardEvent, 'key' | 'keyCode'>): DeviceKey {
  if (event.keyCode === WEBOS_BACK_KEY_CODE) return 'Back';
  switch (event.key) {
    case 'ArrowUp':
      return 'Up';
    case 'ArrowDown':
      return 'Down';
    case 'ArrowLeft':
      return 'Left';
    case 'ArrowRight':
      return 'Right';
    case 'Enter':
      return 'Enter';
    case 'Escape':
    case 'Backspace':
    case 'BrowserBack':
      return 'Back';
    case 'MediaPlay':
      return 'Play';
    case 'MediaPause':
      return 'Pause';
    case 'MediaPlayPause':
    case ' ':
      return 'PlayPause';
    case 'MediaStop':
      return 'Stop';
    case 'MediaFastForward':
      return 'FastForward';
    case 'MediaTrackNext':
      return 'FastForward';
    case 'MediaRewind':
    case 'MediaTrackPrevious':
      return 'Rewind';
    default:
      return 'Unknown';
  }
}

function videoCapabilities(): VideoCapabilities {
  const probe = document.createElement('video');
  const plays = (type: string): boolean => probe.canPlayType(type) !== '';

  const containers: string[] = [];
  if (plays('video/mp4')) containers.push('mp4');
  if (plays('video/webm')) containers.push('webm');
  if (plays('video/x-matroska') || plays('video/webm')) containers.push('mkv');

  const videoCodecs: string[] = [];
  if (plays('video/mp4; codecs="avc1.640029"')) videoCodecs.push('h264');
  if (plays('video/mp4; codecs="hvc1.1.6.L93.B0"')) videoCodecs.push('hevc');
  if (plays('video/webm; codecs="vp8"')) videoCodecs.push('vp8');
  if (plays('video/webm; codecs="vp9"')) videoCodecs.push('vp9');
  if (plays('video/mp4; codecs="av01.0.05M.08"')) videoCodecs.push('av1');

  const audioCodecs: string[] = [];
  if (plays('audio/mp4; codecs="mp4a.40.2"')) audioCodecs.push('aac');
  if (plays('audio/mpeg')) audioCodecs.push('mp3');
  if (plays('audio/mp4; codecs="ac-3"')) audioCodecs.push('ac3');
  if (plays('audio/mp4; codecs="ec-3"')) audioCodecs.push('eac3');
  if (plays('audio/ogg; codecs="opus"') || plays('audio/webm; codecs="opus"')) {
    audioCodecs.push('opus');
  }
  if (plays('audio/flac')) audioCodecs.push('flac');

  return {
    containers,
    videoCodecs,
    audioCodecs,
    maxHeight: Math.max(window.screen.height, window.screen.width) >= 2160 ? 2160 : 1080,
    // `canPlayType` answers a truthy "maybe" for HLS in Chrome even though it
    // cannot play one, so a Media Source path is always preferred where it
    // exists and native HLS is only claimed when there is no MSE.
    playsHlsNatively: plays('application/vnd.apple.mpegurl') && !hasMediaSource(),
    hasMediaSource: hasMediaSource(),
  };
}

function hasMediaSource(): boolean {
  return typeof window.MediaSource !== 'undefined';
}

function subtitleCapabilities(): SubtitleCapabilities {
  return {
    canRenderText: true,
    // A styled-subtitle renderer needs WebAssembly and a worker. Which renderer
    // is chosen is settled where it is loaded, not here.
    canRenderStyled: typeof WebAssembly !== 'undefined' && typeof Worker !== 'undefined',
    /*
     * PGS asks for much less than the styled renderer, and the difference is
     * load-bearing rather than pedantic (#30). libpgs is **plain JavaScript**:
     * no WebAssembly to validate, and it falls back from a worker with an
     * offscreen canvas, to a worker without one, to the main thread — so a
     * canvas is genuinely all it needs. Repeating `canRenderStyled`'s test
     * here would have told a Server to burn PGS into the picture on devices
     * that could have drawn it, which costs a transcode and the Subtitle
     * Offset both.
     *
     * This is also the one claim the DeviceProfile makes on the strength of
     * (`device-profile.ts`), so it must mean "this device can really decode a
     * PGS stream" and nothing looser.
     */
    canRenderImage: typeof HTMLCanvasElement !== 'undefined',
  };
}

/**
 * Worked out once and kept, because all three answers are properties of the
 * browser and cannot change while the page is open.
 *
 * The call is not a cheap one: it builds a detached `<video>` purely to
 * feature-test AirPlay. `player.tsx` asks three separate times in its render
 * body — picture-in-picture, Cast, AirPlay — and re-renders about four times a
 * second while a Title plays, as `setPosition` runs from `timeupdate`. That is
 * a dozen throwaway media elements a second on a project whose floor is webOS 5
 * on a television, for three constants.
 */
let targets: PlaybackTargets | undefined;

function playbackTargets(): PlaybackTargets {
  targets ??= detectPlaybackTargets();
  return targets;
}

function detectPlaybackTargets(): PlaybackTargets {
  const video = document.createElement('video') as HTMLVideoElement & {
    webkitShowPlaybackTargetPicker?: unknown;
    remote?: unknown;
  };
  return {
    /*
     * Whether this browser could Cast at all, which is **a cheap gate and not
     * an answer** — `decisions.md` §8 is explicit that availability cannot be
     * detected without loading the SDK and letting it discover devices. So
     * this decides whether to draw a control; the press is what finds out, and
     * `player.tsx` has one message for every way that can go wrong.
     *
     * **`PresentationRequest` rather than `window.chrome`**, and #33's e2e is
     * what settled it. The research recorded that Jellyfin's own plugin bails
     * on `if (!chrome)`, and this layer copied that — but `window.chrome` is a
     * **branding object**, not a platform feature: it is absent in plain
     * Chromium builds (Playwright's included, which is how this was found) and
     * in several Chromium derivatives where the Cast SDK works perfectly well.
     * A gate on it hides the feature from browsers that have it.
     *
     * The Presentation API is the standard this is really asking about —
     * "can this browser send media to a second screen" — and it is present in
     * exactly the family where Cast works: Chrome, Edge and Chromium, and
     * neither Firefox nor Safari. `window.chrome` stays behind it for an older
     * Chromium that has the branding object but not the API.
     *
     * A slightly generous gate is the right trade in both directions: a
     * control that turns out to lead nowhere costs a User one press and one
     * clear message, where a missing one costs them the feature with nothing
     * said at all.
     */
    cast:
      typeof (window as { PresentationRequest?: unknown }).PresentationRequest === 'function' ||
      ('chrome' in window && typeof (window as { chrome?: unknown }).chrome === 'object'),
    airPlay: video.remote !== undefined || typeof video.webkitShowPlaybackTargetPicker === 'function',
    // Picture-in-picture is Chrome 69, one version above the floor.
    pictureInPicture:
      'pictureInPictureEnabled' in document && document.pictureInPictureEnabled === true,
  };
}

/**
 * `localStorage`, which survives a reload and a restart. Every call is guarded:
 * reading or even touching it throws in a private window and where site data is
 * blocked, and writing throws when the quota is full. When it is unusable the
 * app falls back to remembering things only for this page's lifetime, which
 * means a User signs in again next time rather than seeing an error.
 */
function createBrowserStorage(): DeviceStorage {
  const inMemory = new Map<string, string>();

  function usableStore(): Storage | undefined {
    try {
      const store = window.localStorage;
      const probe = '__jellyflick_probe__';
      store.setItem(probe, '1');
      store.removeItem(probe);
      return store;
    } catch {
      return undefined;
    }
  }

  const store = usableStore();

  return {
    read: (key) => {
      if (store === undefined) return inMemory.get(key);
      try {
        return store.getItem(key) ?? undefined;
      } catch {
        return undefined;
      }
    },
    write: (key, value) => {
      if (store === undefined) {
        inMemory.set(key, value);
        return;
      }
      try {
        store.setItem(key, value);
      } catch {
        inMemory.set(key, value);
      }
    },
    remove: (key) => {
      inMemory.delete(key);
      if (store === undefined) return;
      try {
        store.removeItem(key);
      } catch {
        // Nothing left to do: the value is already unreachable.
      }
    },
  };
}

/**
 * A random, URL-safe id. `crypto.randomUUID` is Chrome 92; `getRandomValues`
 * is Chrome 11, so it is the one the whole target range has.
 */
function randomId(): string {
  const bytes = new Uint8Array(16);
  window.crypto.getRandomValues(bytes);
  let out = '';
  for (const byte of bytes) {
    out += byte.toString(16).padStart(2, '0');
  }
  return out;
}
