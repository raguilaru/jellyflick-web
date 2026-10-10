import { describe, expect, it } from 'vitest';
import { createJellyfinGateway } from '../../src/jellyfin/gateway';
import { fakeRequests } from '../fake-jellyfin/control';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

const identity = {
  client: 'Jellyflick',
  device: 'Test Device',
  appVersion: '0.1.0',
};

describe('the Jellyfin gateway', () => {
  it('reads the Server name and version from system info', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'reads-system-info',
      ...identity,
    });

    const info = await gateway.getPublicSystemInfo();

    expect(info.ServerName).toBe('Fake Jellyfin');
    expect(info.Version).toBe('12.2.0');
  });

  it('identifies itself to the Server with a MediaBrowser authorization header', async () => {
    const deviceId = 'identifies-itself';
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId,
      ...identity,
    });

    await gateway.getPublicSystemInfo();

    expect(await authorizationSeenFor(deviceId)).toBe(
      'MediaBrowser Client="Jellyflick", Device="Test%20Device", DeviceId="identifies-itself", Version="0.1.0"',
    );
  });

  it('includes the access token in the authorization header once there is one', async () => {
    const deviceId = 'carries-a-token';
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId,
      ...identity,
      token: 'tok-123',
    });

    await gateway.getPublicSystemInfo();

    expect(await authorizationSeenFor(deviceId)).toContain('Token="tok-123"');
  });

  it('tolerates a Server address with a trailing slash', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: `${fakeJellyfinUrl()}/`,
      deviceId: 'trailing-slash',
      ...identity,
    });

    await expect(gateway.getPublicSystemInfo()).resolves.toMatchObject({ Version: '12.2.0' });
  });

  it('reports an unreachable Server as a transport failure', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: 'http://127.0.0.1:1/',
      deviceId: 'unreachable',
      ...identity,
    });

    await expect(gateway.getPublicSystemInfo()).rejects.toThrow();
  });
});

/**
 * The authorization header of the last request the fake saw from this DeviceId.
 * Matched on the DeviceId because every test file shares one fake Jellyfin.
 */
async function authorizationSeenFor(deviceId: string): Promise<string | undefined> {
  const requests = await fakeRequests();
  const mine = requests.filter((request) =>
    (request.headers.authorization ?? '').includes(`DeviceId="${deviceId}"`),
  );
  return mine[mine.length - 1]?.headers.authorization;
}
