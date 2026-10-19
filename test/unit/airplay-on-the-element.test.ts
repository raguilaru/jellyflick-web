import { describe, expect, it, vi } from 'vitest';
import {
  airPlayApiFor,
  showAirPlayPicker,
  watchAirPlayTargets,
} from '../../src/playback/air-play';

/**
 * AirPlay, which is a property of the **element** rather than of this app
 * (#33, third acceptance criterion).
 *
 * There is nothing to build here beyond asking Safari for its own picker, so
 * what is worth pinning is the **choice between two generations of API** —
 * `decisions.md` §8 says the standard Remote Playback API is preferred, with
 * `webkitShowPlaybackTargetPicker()` as the fallback — and the two things that
 * are easy to get wrong in the fallback and have no second chance:
 *
 * - `event.availability` is the **string** `"available"`, not a boolean, which
 *   is Apple's own release note and would read as truthy either way: a button
 *   shown when there is no Apple TV in the house looks exactly like a working
 *   one until it is pressed.
 * - A watch has to be **cancelled**, or an element torn down on a
 *   re-negotiation leaves Safari a callback into a dead player.
 *
 * The elements below are **shaped by hand** rather than real: happy-dom has
 * neither API, and a real `HTMLVideoElement` here would have `remote` in
 * Chromium and nothing in happy-dom, so the one thing this file is about —
 * which of the two is chosen — could not be stated at all. What a real Safari
 * does with the call is not knowable in any test suite; `test/e2e` runs the
 * fallback against a real element and a real event in Chromium, and the rest
 * is Apple's.
 */

/** An element with the standard Remote Playback API, and its record. */
function withRemotePlayback(options: { watchRejects?: boolean } = {}) {
  const record = {
    watched: [] as ((available: boolean) => void)[],
    cancelled: [] as number[],
    prompted: 0,
  };
  const element = {
    remote: {
      watchAvailability: (callback: (available: boolean) => void) => {
        if (options.watchRejects === true) {
          return Promise.reject(new Error('Continuous watching is not supported here.'));
        }
        record.watched.push(callback);
        return Promise.resolve(7);
      },
      cancelWatchAvailability: (id: number) => {
        record.cancelled.push(id);
        return Promise.resolve();
      },
      prompt: () => {
        record.prompted += 1;
        return Promise.resolve();
      },
    },
  };
  return { element: element as unknown as HTMLVideoElement, record };
}

/** An element with only the WebKit-prefixed pair, and its record. */
function withWebkitAirPlay() {
  const listeners = new Map<string, ((event: Event) => void)[]>();
  const record = { picked: 0 };
  const element = {
    webkitShowPlaybackTargetPicker: () => {
      record.picked += 1;
    },
    addEventListener: (type: string, listener: (event: Event) => void) => {
      listeners.set(type, [...(listeners.get(type) ?? []), listener]);
    },
    removeEventListener: (type: string, listener: (event: Event) => void) => {
      listeners.set(type, (listeners.get(type) ?? []).filter((held) => held !== listener));
    },
  };
  /** Fires Safari's own event, with the string availability it really carries. */
  const announce = (availability: string): void => {
    for (const listener of listeners.get('webkitplaybacktargetavailabilitychanged') ?? []) {
      listener({ availability } as unknown as Event);
    }
  };
  const watching = (): number =>
    (listeners.get('webkitplaybacktargetavailabilitychanged') ?? []).length;
  return { element: element as unknown as HTMLVideoElement, record, announce, watching };
}

describe('which AirPlay API an element has', () => {
  it('prefers the standard Remote Playback API', () => {
    expect(airPlayApiFor(withRemotePlayback().element)).toBe('remote-playback');
  });

  it('falls back to the WebKit picker on an element with only that', () => {
    expect(airPlayApiFor(withWebkitAirPlay().element)).toBe('webkit');
  });

  /**
   * An element with **both** takes the standard one, which is the whole of
   * `decisions.md` §8's "prefer". Safari 13.1 and later has both, so this is
   * the common case on a Mac rather than a curiosity.
   */
  it('takes the standard API on an element that has both', () => {
    const both = {
      ...(withRemotePlayback().element as unknown as Record<string, unknown>),
      webkitShowPlaybackTargetPicker: () => undefined,
    };
    expect(airPlayApiFor(both as unknown as HTMLVideoElement)).toBe('remote-playback');
  });

  it('says none for an element with neither', () => {
    expect(airPlayApiFor({} as unknown as HTMLVideoElement)).toBe('none');
  });
});

describe('watching for somewhere to AirPlay to', () => {
  it('reports what the standard API says, and cancels the watch when it is done', async () => {
    const { element, record } = withRemotePlayback();
    const seen: boolean[] = [];

    const stop = watchAirPlayTargets(element, (available) => seen.push(available));
    await vi.waitFor(() => expect(record.watched.length).toBe(1));

    record.watched[0]?.(true);
    expect(seen).toEqual([true]);
    record.watched[0]?.(false);
    expect(seen).toEqual([true, false]);

    stop();
    // The id the watch resolved with, so Safari is not left calling into a
    // player that has been torn down by a re-negotiation.
    await vi.waitFor(() => expect(record.cancelled).toEqual([7]));
  });

  /**
   * MDN's own pattern: a browser that cannot watch continuously is not a
   * browser with no AirPlay, so the button is shown and the press is what
   * finds out. Hiding it would be the worse failure of the two.
   */
  it('shows the button anyway when the standard API will not watch', async () => {
    const { element } = withRemotePlayback({ watchRejects: true });
    const seen: boolean[] = [];
    watchAirPlayTargets(element, (available) => seen.push(available));
    await vi.waitFor(() => expect(seen).toEqual([true]));
  });

  /**
   * The fallback, and the string this file exists for: `"available"` and
   * `"not-available"` are what Safari sends, and both are truthy.
   */
  it('reads Safari’s string availability rather than its truthiness', () => {
    const { element, announce, watching } = withWebkitAirPlay();
    const seen: boolean[] = [];

    const stop = watchAirPlayTargets(element, (available) => seen.push(available));
    announce('available');
    announce('not-available');
    expect(seen).toEqual([true, false]);

    stop();
    expect(watching()).toBe(0);
    announce('available');
    expect(seen).toEqual([true, false]);
  });

  /** An element with neither API is watched by doing nothing, not by throwing. */
  it('is nothing at all on an element with neither API', () => {
    const seen: boolean[] = [];
    const stop = watchAirPlayTargets({} as unknown as HTMLVideoElement, (available) =>
      seen.push(available),
    );
    expect(seen).toEqual([]);
    expect(() => stop()).not.toThrow();
  });
});

describe('opening Safari’s own picker', () => {
  it('prompts through the standard API where there is one', () => {
    const { element, record } = withRemotePlayback();
    expect(showAirPlayPicker(element)).toBe(true);
    expect(record.prompted).toBe(1);
  });

  it('opens the WebKit picker on an element with only that', () => {
    const { element, record } = withWebkitAirPlay();
    expect(showAirPlayPicker(element)).toBe(true);
    expect(record.picked).toBe(1);
  });

  /**
   * A dismissed picker **rejects**, and a User who changed their mind has not
   * met an error: the Title is still playing on this device and there is
   * nothing to say about it.
   */
  it('swallows a picker the User dismissed', async () => {
    const dismissing = {
      remote: {
        watchAvailability: () => Promise.resolve(1),
        cancelWatchAvailability: () => Promise.resolve(),
        prompt: () => Promise.reject(new Error('The User dismissed the picker.')),
      },
    } as unknown as HTMLVideoElement;
    expect(showAirPlayPicker(dismissing)).toBe(true);
    // An unhandled rejection would fail this file; settling is the assertion.
    await Promise.resolve();
  });

  it('says so rather than throwing on an element with neither API', () => {
    expect(showAirPlayPicker({} as unknown as HTMLVideoElement)).toBe(false);
  });
});
