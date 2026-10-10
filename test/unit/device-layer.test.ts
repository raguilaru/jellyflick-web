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
});

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

  it('names one capability profile per device class the project targets', () => {
    expect(Object.keys(CAPABILITY_PROFILES).sort()).toEqual([
      'modern-desktop-browser',
      'phone-safari',
      'webos-5-like',
    ]);
  });
});
