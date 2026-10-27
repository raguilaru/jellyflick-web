import { afterEach, describe, expect, it } from 'vitest';
import { connectToServer } from '../../src/connect/connect-to-server';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';
import { setFakeState, resetFakeState } from '../fake-jellyfin/control';
import { testDeviceLayer } from '../device/profiles';

const options = {
  client: 'Jellyflick',
  appVersion: '0.1.0',
  device: testDeviceLayer().deviceName(),
  deviceId: 'device-under-test',
};

afterEach(resetFakeState);

describe('connecting to a Server', () => {
  it('connects to a Server on 12.0 or later and reports its name', async () => {
    const result = await connectToServer(fakeJellyfinUrl(), options);

    expect(result).toEqual({
      outcome: 'connected',
      serverAddress: fakeJellyfinUrl(),
      serverName: 'Fake Jellyfin',
      version: '12.2.0',
    });
  });

  it('refuses a Server older than 12.0', async () => {
    await setFakeState({ systemInfo: { Version: '10.10.7' } });

    const result = await connectToServer(fakeJellyfinUrl(), options);

    expect(result).toEqual({
      outcome: 'server-too-old',
      serverAddress: fakeJellyfinUrl(),
      version: '10.10.7',
    });
  });

  it('accepts a Server on exactly 12.0', async () => {
    await setFakeState({ systemInfo: { Version: '12.0.0' } });

    const result = await connectToServer(fakeJellyfinUrl(), options);

    expect(result.outcome).toBe('connected');
  });

  it('does not compare versions as text, so 9.x is older than 12.x', async () => {
    await setFakeState({ systemInfo: { Version: '9.9.9' } });

    const result = await connectToServer(fakeJellyfinUrl(), options);

    expect(result.outcome).toBe('server-too-old');
  });

  it('reports an address nothing answers on as unreachable', async () => {
    const result = await connectToServer('http://127.0.0.1:1', options);

    expect(result).toEqual({ outcome: 'unreachable', serverAddress: 'http://127.0.0.1:1' });
  });

  it('reports an address that answers without a Jellyfin version as not a Server', async () => {
    const result = await connectToServer(`${fakeJellyfinUrl()}/__fake/health`, options);

    expect(result.outcome).toBe('not-a-jellyfin-server');
  });

  it('rejects an empty address without going near the network', async () => {
    const result = await connectToServer('   ', options);

    expect(result).toEqual({ outcome: 'address-invalid' });
  });

  it('assumes http for an address typed without a scheme, as a Server on the home network needs', async () => {
    const result = await connectToServer(`127.0.0.1:${new URL(fakeJellyfinUrl()).port}`, options);

    expect(result).toMatchObject({ outcome: 'connected', serverAddress: fakeJellyfinUrl() });
  });

  it('ignores a trailing slash so the address is stored in one shape', async () => {
    const result = await connectToServer(`${fakeJellyfinUrl()}/`, options);

    expect(result).toMatchObject({ serverAddress: fakeJellyfinUrl() });
  });
});
