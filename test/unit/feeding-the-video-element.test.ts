import { describe, expect, it, vi } from 'vitest';
import { attachPlaybackSource, type HlsModule } from '../../src/playback/video-source';
import type { PlaybackPlan } from '../../src/playback/planning';
import { CAPABILITY_PROFILES } from '../device/profiles';

/**
 * How a plan reaches a `<video>`: straight onto `src` for a file, the device's
 * own player for an HLS playlist where there is one, and hls.js **only** where
 * there is not.
 *
 * That last word is the point of this file. hls.js is by far the largest thing
 * the app could ship, and the spec's lightness constraint is about the bundle a
 * TV downloads, so it has to be a chunk that is fetched when a transcode is
 * played and never otherwise. The loader is injected here so a test can see
 * whether it was called at all; in the app it is one `import()`, which is what
 * makes it a chunk.
 */

const FILE_PLAN: PlaybackPlan = {
  itemId: 'movie-arrival',
  mediaSourceId: 'source-movie-arrival',
  playSessionId: 'play-session-movie-arrival',
  url: 'http://server.test/Videos/movie-arrival/stream.webm?static=true',
  playMethod: 'DirectPlay',
  delivery: 'file',
  startTicks: 0,
};

const HLS_PLAN: PlaybackPlan = {
  ...FILE_PLAN,
  url: 'http://server.test/Videos/movie-arrival/master.m3u8?ApiKey=tok',
  playMethod: 'Transcode',
  delivery: 'hls',
};

/** A stand-in for hls.js: enough of it to see which calls were made. */
function fakeHls(options: { supported?: boolean } = {}) {
  const attached: { url?: string; media?: unknown; destroyed: boolean } = { destroyed: false };
  const module: HlsModule = {
    default: class {
      static isSupported(): boolean {
        return options.supported ?? true;
      }
      loadSource(url: string): void {
        attached.url = url;
      }
      attachMedia(media: unknown): void {
        attached.media = media;
      }
      destroy(): void {
        attached.destroyed = true;
      }
    } as unknown as HlsModule['default'],
  };
  return { module, attached };
}

function videoElement(): HTMLVideoElement {
  return document.createElement('video');
}

describe('feeding a plan to the video element', () => {
  it('plays a file by putting its URL on the element, and loads nothing', async () => {
    const video = videoElement();
    const loadHls = vi.fn();

    const attached = await attachPlaybackSource(video, FILE_PLAN, {
      capabilities: CAPABILITY_PROFILES['modern-desktop-browser'].video,
      loadHls,
    });

    expect(video.src).toBe(FILE_PLAN.url);
    expect(loadHls).not.toHaveBeenCalled();
    expect(attached.usingHlsJs).toBe(false);
  });

  it('lets a device that plays a playlist itself do exactly that', async () => {
    const video = videoElement();
    const loadHls = vi.fn();

    const attached = await attachPlaybackSource(video, HLS_PLAN, {
      // A phone: a native HLS player, and no Media Source at all.
      capabilities: CAPABILITY_PROFILES['phone-safari'].video,
      loadHls,
    });

    expect(video.src).toBe(HLS_PLAN.url);
    expect(loadHls).not.toHaveBeenCalled();
    expect(attached.usingHlsJs).toBe(false);
  });

  it('loads hls.js only where a playlist needs it, and hands it the playlist', async () => {
    const video = videoElement();
    const hls = fakeHls();
    const loadHls = vi.fn().mockResolvedValue(hls.module);

    const attached = await attachPlaybackSource(video, HLS_PLAN, {
      // A TV: a Media Source, and no HLS player of its own.
      capabilities: CAPABILITY_PROFILES['webos-5-like'].video,
      loadHls,
    });

    expect(loadHls).toHaveBeenCalledTimes(1);
    expect(attached.usingHlsJs).toBe(true);
    expect(hls.attached.url).toBe(HLS_PLAN.url);
    expect(hls.attached.media).toBe(video);
    // The element's own `src` is left alone: hls.js feeds it through MSE.
    expect(video.src).toBe('');
  });

  it('gives the element the playlist anyway when hls.js says it cannot run', async () => {
    const video = videoElement();
    const hls = fakeHls({ supported: false });
    const loadHls = vi.fn().mockResolvedValue(hls.module);

    const attached = await attachPlaybackSource(video, HLS_PLAN, {
      capabilities: CAPABILITY_PROFILES['webos-5-like'].video,
      loadHls,
    });

    // Better a browser that may cope than a black screen with nothing tried.
    expect(video.src).toBe(HLS_PLAN.url);
    expect(attached.usingHlsJs).toBe(false);
  });

  it('tears hls.js down when the player closes, so no transcode is left running', async () => {
    const video = videoElement();
    const hls = fakeHls();
    const loadHls = vi.fn().mockResolvedValue(hls.module);

    const attached = await attachPlaybackSource(video, HLS_PLAN, {
      capabilities: CAPABILITY_PROFILES['webos-5-like'].video,
      loadHls,
    });
    attached.detach();

    expect(hls.attached.destroyed).toBe(true);
  });

  it('lets go of the file it was playing when the player closes', async () => {
    const video = videoElement();

    const attached = await attachPlaybackSource(video, FILE_PLAN, {
      capabilities: CAPABILITY_PROFILES['modern-desktop-browser'].video,
      loadHls: vi.fn(),
    });
    attached.detach();

    // Leaving a src on a detached element keeps the download going, which on a
    // TV is the difference between closing the player and not.
    expect(video.src).toBe('');
  });
});
