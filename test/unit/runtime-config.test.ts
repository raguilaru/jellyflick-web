import { afterEach, describe, expect, it } from 'vitest';
import { readRuntimeConfig } from '../../src/runtime-config';

afterEach(() => {
  delete window.__JELLYFLICK_CONFIG__;
});

describe('the runtime config', () => {
  it('reads the preset Server address the container wrote', () => {
    window.__JELLYFLICK_CONFIG__ = { serverAddress: 'https://jellyfin.example.lan' };

    expect(readRuntimeConfig().presetServerAddress).toBe('https://jellyfin.example.lan');
  });

  it('normalises a preset address with a trailing slash', () => {
    window.__JELLYFLICK_CONFIG__ = { serverAddress: 'https://jellyfin.example.lan/' };

    expect(readRuntimeConfig().presetServerAddress).toBe('https://jellyfin.example.lan');
  });

  it('has no preset address when the host left the setting empty', () => {
    window.__JELLYFLICK_CONFIG__ = { serverAddress: '' };

    expect(readRuntimeConfig().presetServerAddress).toBeUndefined();
  });

  it('has no preset address when there is no config file at all', () => {
    expect(readRuntimeConfig().presetServerAddress).toBeUndefined();
  });

  it('reports the app version the container stamped in', () => {
    window.__JELLYFLICK_CONFIG__ = { serverAddress: '', appVersion: '1.4.0' };

    expect(readRuntimeConfig().appVersion).toBe('1.4.0');
  });

  it('calls the version "dev" when nothing stamped one in', () => {
    expect(readRuntimeConfig().appVersion).toBe('dev');
  });

  it('carries nothing but the Server address and the version, so no secret can leak into the browser', () => {
    window.__JELLYFLICK_CONFIG__ = {
      serverAddress: 'https://jellyfin.example.lan',
      appVersion: '1.4.0',
    };

    expect(Object.keys(readRuntimeConfig()).sort()).toEqual(['appVersion', 'presetServerAddress']);
  });
});
