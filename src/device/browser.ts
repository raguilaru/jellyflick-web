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
    canRenderImage: typeof WebAssembly !== 'undefined' && typeof Worker !== 'undefined',
  };
}

function playbackTargets(): PlaybackTargets {
  const video = document.createElement('video') as HTMLVideoElement & {
    webkitShowPlaybackTargetPicker?: unknown;
    remote?: unknown;
  };
  return {
    // The Cast SDK is loaded on demand, so this only reports whether the
    // browser has the hook the SDK needs.
    cast: 'chrome' in window && typeof (window as { chrome?: unknown }).chrome === 'object',
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
