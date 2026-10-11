import { describe, expect, it } from 'vitest';
import { createBrowserDeviceLayer } from '../../src/device/browser';
import { CAPABILITY_PROFILES, FIXED_NOW, testDeviceLayer } from '../device/profiles';

describe('the browser device layer', () => {
  const device = createBrowserDeviceLayer();

  it('maps the arrow keys a remote sends onto directions', () => {
    expect(device.keyFor({ key: 'ArrowUp', keyCode: 38 })).toBe('Up');
    expect(device.keyFor({ key: 'ArrowDown', keyCode: 40 })).toBe('Down');
    expect(device.keyFor({ key: 'ArrowLeft', keyCode: 37 })).toBe('Left');
    expect(device.keyFor({ key: 'ArrowRight', keyCode: 39 })).toBe('Right');
  });

  it('maps Escape to Back, which is what a keyboard User has', () => {
    expect(device.keyFor({ key: 'Escape', keyCode: 27 })).toBe('Back');
  });

  it("maps a TV remote's Back key, which arrives as key code 461 with no name", () => {
    expect(device.keyFor({ key: 'Unidentified', keyCode: 461 })).toBe('Back');
  });

  it('calls a key it does not know Unknown rather than guessing', () => {
    expect(device.keyFor({ key: 'F7', keyCode: 118 })).toBe('Unknown');
  });

  it('gives a different DeviceId each time, so each signed-in User gets their own', () => {
    const first = device.newDeviceId();
    const second = device.newDeviceId();

    expect(first).toMatch(/^[0-9a-f]{32}$/);
    expect(second).not.toBe(first);
  });

  it('always offers plain-text subtitle rendering, which is the common case', () => {
    expect(device.subtitleCapabilities().canRenderText).toBe(true);
  });

  /**
   * happy-dom presents a desktop: `(any-pointer: fine)` matches and there are
   * no touch points. So the honest answer here is `computer`, and the three
   * tests below drive the environment itself — `matchMedia` and
   * `maxTouchPoints` are the device, not an internal collaborator, and they
   * are the only things the answer is allowed to come from. A user agent is
   * deliberately never consulted: `deviceName()` is the one place that reads
   * it, and only for a label.
   */
  it('calls the environment it is tested in a computer, which is what it is', () => {
    expect(device.deviceForm()).toBe('computer');
  });

  it('calls a device with no fine pointer and nothing to touch a TV', () => {
    withDevice({ finePointer: false, touchPoints: 0 }, () => {
      expect(createBrowserDeviceLayer().deviceForm()).toBe('tv');
    });
  });

  it('calls a device with touch but no fine pointer a handheld', () => {
    withDevice({ finePointer: false, touchPoints: 5 }, () => {
      expect(createBrowserDeviceLayer().deviceForm()).toBe('handheld');
    });
  });

  /**
   * A device too old to answer a media query is called a computer, because
   * that is the form whose screen works with every kind of input: a wrong
   * guess costs a User one extra press rather than a screen they cannot use.
   */
  it('falls back to a computer where there is no matchMedia to ask', () => {
    withDevice({ finePointer: undefined, touchPoints: 0 }, () => {
      expect(createBrowserDeviceLayer().deviceForm()).toBe('computer');
    });
  });
});

/**
 * Runs a test against a different device: a given answer to the pointer media
 * query — or no `matchMedia` at all — and a given number of touch points.
 * Everything is put back afterwards, whatever the test did.
 */
function withDevice(
  shape: { finePointer: boolean | undefined; touchPoints: number },
  body: () => void,
): void {
  const realMatchMedia = window.matchMedia;
  const realTouchPoints = navigator.maxTouchPoints;
  const define = (target: object, name: string, value: unknown) => {
    Object.defineProperty(target, name, { value, configurable: true, writable: true });
  };

  define(navigator, 'maxTouchPoints', shape.touchPoints);
  if (shape.finePointer === undefined) {
    define(window, 'matchMedia', undefined);
  } else {
    define(window, 'matchMedia', (query: string) => ({
      matches: query.includes('pointer: fine') ? shape.finePointer : false,
      media: query,
    }));
  }

  try {
    body();
  } finally {
    define(window, 'matchMedia', realMatchMedia);
    define(navigator, 'maxTouchPoints', realTouchPoints);
  }
}

describe('the test device layers', () => {
  it('holds the clock still, so date-derived behaviour is repeatable', () => {
    const device = testDeviceLayer();

    expect(device.now()).toBe(FIXED_NOW);
    expect(device.now()).toBe(FIXED_NOW);
  });

  it('returns the given random numbers in order and then repeats them', () => {
    const device = testDeviceLayer({ randomSequence: [0.1, 0.9] });

    expect([device.random(), device.random(), device.random()]).toEqual([0.1, 0.9, 0.1]);
  });

  it('offers a webOS 5-like profile that can draw neither styled nor image subtitles', () => {
    const device = testDeviceLayer({ profile: 'webos-5-like' });

    expect(device.subtitleCapabilities()).toEqual({
      canRenderText: true,
      canRenderStyled: false,
      canRenderImage: false,
    });
  });

  it('offers a webOS 5-like profile without picture-in-picture, which is Chrome 69', () => {
    expect(testDeviceLayer({ profile: 'webos-5-like' }).playbackTargets().pictureInPicture).toBe(
      false,
    );
  });

  it('offers a phone Safari profile that plays HLS natively and can AirPlay', () => {
    const device = testDeviceLayer({ profile: 'phone-safari' });

    expect(device.videoCapabilities().playsHlsNatively).toBe(true);
    expect(device.playbackTargets().airPlay).toBe(true);
  });

  /**
   * The form is what decides whether Quick Connect is offered before a
   * password (#9): typing one with a remote is the thing being avoided, so a
   * profile that claims the wrong form would quietly test the wrong screen.
   */
  it('gives each profile the device form that matches the class it stands for', () => {
    expect(testDeviceLayer({ profile: 'webos-5-like' }).deviceForm()).toBe('tv');
    expect(testDeviceLayer({ profile: 'phone-safari' }).deviceForm()).toBe('handheld');
    expect(testDeviceLayer({ profile: 'modern-desktop-browser' }).deviceForm()).toBe('computer');
  });

  it('names one capability profile per device class the project targets', () => {
    expect(Object.keys(CAPABILITY_PROFILES).sort()).toEqual([
      'modern-desktop-browser',
      'phone-safari',
      'webos-5-like',
    ]);
  });
});
