import { afterEach, describe, expect, it } from 'vitest';
import { createJellyfinGateway } from '../../src/jellyfin/gateway';
import { fakeRequests, resetFakeState, setFakeState } from '../fake-jellyfin/control';
import { SAMPLE_PASSWORD } from '../fake-jellyfin/data';
import { fakeJellyfinUrl } from '../fake-jellyfin/url';

const identity = {
  client: 'Jellyflick',
  device: 'Test Device',
  appVersion: '0.1.0',
};

/** A token the fake accepts for Rafael: the Server issues one per DeviceId. */
const tokenFor = (deviceId: string) => `token-user-rafael-${deviceId}`;

// The favourite tests write to the Server, so the sample data goes back.
afterEach(resetFakeState);

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

  it('lists the libraries the Server offers, with what each one holds', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'lists-libraries',
      ...identity,
      token: tokenFor('lists-libraries'),
    });

    const libraries = await gateway.getUserViews();

    expect(libraries.map((library) => [library.Name, library.CollectionType])).toEqual([
      ['Movies', 'movies'],
      ['Kids', 'movies'],
      ['Series', 'tvshows'],
      ['Music', 'music'],
    ]);
  });

  it('reads one library’s latest additions, newest first', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'reads-latest',
      ...identity,
      token: tokenFor('reads-latest'),
    });

    const latest = await gateway.getLatestItems({ parentId: 'lib-kids' });

    // The newest Episode first, then the other, then the Movie: the Series
    // itself is not among them, which is why a client has to collapse Episodes.
    expect(latest.map((item) => item.Id)).toEqual([
      'episode-bluey-s2e3',
      'episode-bluey-s2e2',
      'movie-paddington',
    ]);
  });

  it('asks for no more of a library’s latest additions than it wants', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'limits-latest',
      ...identity,
      token: tokenFor('limits-latest'),
    });

    const latest = await gateway.getLatestItems({ parentId: 'lib-kids', limit: 1 });

    expect(latest.map((item) => item.Id)).toEqual(['episode-bluey-s2e3']);
  });

  it('builds an item image URL from the id, the image type and the tag', () => {
    const gateway = createJellyfinGateway({
      serverAddress: 'http://server.test',
      deviceId: 'item-image',
      ...identity,
    });

    expect(
      gateway.itemImageUrl('series-bluey', 'Primary', { tag: 'tag-bluey', maxWidth: 400 }),
    ).toBe('http://server.test/Items/series-bluey/Images/Primary?tag=tag-bluey&maxWidth=400');
  });

  it('reads the Titles in a User’s My List, by name', async () => {
    await setFakeState({
      favourites: { 'user-rafael': ['movie-heat', 'movie-arrival', 'album-nocturnes'] },
    });
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'reads-my-list',
      ...identity,
      token: tokenFor('reads-my-list'),
    });

    const favourites = await gateway.getFavouriteItems();

    // By name, and Movies and Series only: a favourited album is not a Title.
    expect(favourites.map((item) => item.Id)).toEqual(['movie-arrival', 'movie-heat']);
  });

  it('adds an item to the User’s favourites on the Server', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'adds-a-favourite',
      ...identity,
      token: tokenFor('adds-a-favourite'),
    });

    await gateway.addToFavourites('movie-paddington');

    expect((await gateway.getFavouriteItems()).map((item) => item.Id)).toEqual([
      'movie-paddington',
    ]);
  });

  it('removes an item from the User’s favourites on the Server', async () => {
    await setFakeState({ favourites: { 'user-rafael': ['movie-heat', 'movie-arrival'] } });
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'removes-a-favourite',
      ...identity,
      token: tokenFor('removes-a-favourite'),
    });

    await gateway.removeFromFavourites('movie-heat');

    expect((await gateway.getFavouriteItems()).map((item) => item.Id)).toEqual(['movie-arrival']);
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
