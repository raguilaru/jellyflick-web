import { describe, expect, it } from 'vitest';
import { createJellyfinGateway } from '../../src/jellyfin/gateway';
import { fakeRequests } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
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

  it('lists the Server’s public users, leaving hidden accounts out', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'lists-public-users',
      ...identity,
    });

    const users = await gateway.getPublicUsers();

    expect(users.map((user) => user.Name)).toEqual(['Rafael', 'Marina', 'Nico']);
  });

  it('exchanges a username and password for an access token', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'authenticates',
      ...identity,
    });

    const result = await gateway.authenticateByName('Rafael', SAMPLE_PASSWORD);

    expect(result.User?.Name).toBe('Rafael');
    expect(result.AccessToken).toBeTruthy();
  });

  it('authenticates a user the public list hides', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'authenticates-hidden',
      ...identity,
    });

    const result = await gateway.authenticateByName('Ghost', SAMPLE_PASSWORD);

    expect(result.User?.Id).toBe('user-ghost');
  });

  it('rejects a wrong password with 401 rather than a token', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'wrong-password',
      ...identity,
    });

    await expect(gateway.authenticateByName('Rafael', 'nope')).rejects.toMatchObject({
      status: 401,
    });
  });

  it('builds a User picture URL from the id and the picture tag', () => {
    const gateway = createJellyfinGateway({
      serverAddress: 'http://server.test',
      deviceId: 'user-image',
      ...identity,
    });

    expect(gateway.userImageUrl('user-rafael', 'tag-rafael')).toBe(
      'http://server.test/UserImage?userId=user-rafael&tag=tag-rafael',
    );
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
