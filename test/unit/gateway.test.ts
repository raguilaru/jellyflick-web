import { afterEach, describe, expect, it } from 'vitest';
import { buildAuthorizationHeader } from '../../src/jellyfin/authorization';
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

    // Newest first, and neither the Series nor its Seasons are among them —
    // which is why a client has to collapse Episodes into their Series itself.
    expect(latest.map((item) => item.Id)).toEqual([
      'episode-bluey-s2e3',
      'episode-bluey-s2e2',
      'movie-paddington',
      'episode-bluey-s1e2',
      'episode-bluey-s1e1',
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

  it('searches the whole Server for Titles matching a term', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'searches',
      ...identity,
      token: tokenFor('searches'),
    });

    const found = await gateway.getTitles({ searchTerm: 'he' });

    expect(found.map((item) => item.Name)).toEqual(['Heat', 'The Unfinished']);
  });

  it('leaves everything that is not a Movie or a Series out of a search', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'searches-titles-only',
      ...identity,
      token: tokenFor('searches-titles-only'),
    });

    // A stray video file and a music album, both of which the Server would
    // match on the name if it were asked for every kind of item.
    expect(await gateway.getTitles({ searchTerm: 'Holiday' })).toEqual([]);
    expect(await gateway.getTitles({ searchTerm: 'Nocturnes' })).toEqual([]);
  });

  it('lists the genres the Server’s Movies and Series are in, in name order', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'lists-genres',
      ...identity,
      token: tokenFor('lists-genres'),
    });

    const genres = await gateway.getTitleGenres();

    // Classical belongs to the music album alone, so it is not a genre of
    // anything this app shows.
    expect(genres.map((genre) => genre.Name)).toEqual([
      'Comedy',
      'Crime',
      'Drama',
      'Family',
      'Science Fiction',
      'Thriller',
    ]);
  });

  it('reads the Titles in one genre, whether they are Movies or Series', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'reads-a-genre',
      ...identity,
      token: tokenFor('reads-a-genre'),
    });

    const inFamily = await gateway.getTitles({ genre: 'Family' });

    expect(inFamily.map((item) => [item.Name, item.Type])).toEqual([
      ['Bluey', 'Series'],
      ['Paddington', 'Movie'],
    ]);
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

  it('reads the newest additions of every kind, newest first, with their dates', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'reads-additions',
      ...identity,
      token: tokenFor('reads-additions'),
    });

    const additions = await gateway.getRecentAdditions({ limit: 3 });

    // The one query that sees a Season and an Episode as themselves, because a
    // Title Label is about what was added (#14) — and it asks for
    // `DateCreated`, which the Server sends only when it is named. The newest
    // addition on the whole Server is an album, and it is still not in this:
    // nothing the app shows is made new by it.
    expect(additions.map((item) => item.Id)).toEqual([
      'episode-bluey-s2e3',
      'episode-bluey-s2e2',
      'episode-severance-s2e4',
    ]);
    expect(additions[0]?.DateCreated).toBe('2026-06-14T20:00:00Z');
  });

  it('reads what a User has started and not finished, most recently played first', async () => {
    await setFakeState({
      playbackPositions: {
        'user-rafael': { 'movie-heat': 100, 'episode-severance-s2e4': 200 },
      },
      lastPlayedDates: {
        'user-rafael': {
          'movie-heat': '2026-06-14T21:00:00Z',
          'episode-severance-s2e4': '2026-06-15T09:00:00Z',
        },
      },
    });
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'reads-resume',
      ...identity,
      token: tokenFor('reads-resume'),
    });

    const resume = await gateway.getResumeItems();

    expect(resume.map((item) => item.Id)).toEqual(['episode-severance-s2e4', 'movie-heat']);
    // The progress bar and the resume point are both `UserData`, so this is the
    // one Row's query that cannot do without it.
    expect(resume[0]?.UserData?.PlaybackPositionTicks).toBe(200);
    expect(resume[0]?.UserData?.LastPlayedDate).toBe('2026-06-15T09:00:00Z');
  });

  it('reads the next Episode of each Series a User is watching', async () => {
    await setFakeState({
      played: { 'user-rafael': ['episode-severance-s2e3'] },
      lastPlayedDates: { 'user-rafael': { 'episode-severance-s2e3': '2026-06-15T09:00:00Z' } },
    });
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'reads-next-up',
      ...identity,
      token: tokenFor('reads-next-up'),
    });

    const nextUp = await gateway.getNextUpItems();

    // One Episode per Series, and only for a Series the User has started —
    // Bluey is untouched, so there is no "next" Episode of it.
    expect(nextUp.map((item) => item.Id)).toEqual(['episode-severance-s2e4']);
  });

  it('reads when each Series was last watched, from the Episodes a User finished', async () => {
    await setFakeState({
      played: { 'user-rafael': ['episode-severance-s2e3', 'episode-bluey-s2e2'] },
      lastPlayedDates: {
        'user-rafael': {
          'episode-severance-s2e3': '2026-06-15T09:00:00Z',
          'episode-bluey-s2e2': '2026-06-16T08:00:00Z',
        },
      },
    });
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'reads-played-episodes',
      ...identity,
      token: tokenFor('reads-played-episodes'),
    });

    const played = await gateway.getPlayedEpisodes();

    // Most recently played first: it is the only thing this query is for, and
    // the next unwatched Episode of a Series has no date of its own at all.
    expect(played.map((item) => item.Id)).toEqual([
      'episode-bluey-s2e2',
      'episode-severance-s2e3',
    ]);
  });

  it('clears a resume point without touching the watched state', async () => {
    await setFakeState({
      playbackPositions: { 'user-rafael': { 'movie-heat': 500 } },
      played: { 'user-rafael': ['movie-arrival'] },
    });
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'clears-a-resume-point',
      ...identity,
      token: tokenFor('clears-a-resume-point'),
    });

    const data = await gateway.saveUserItemData({
      itemId: 'movie-heat',
      playbackPositionTicks: 0,
    });

    expect(data.PlaybackPositionTicks).toBe(0);
    // Nothing else changes: only the fields the write named are sent, and the
    // Server leaves the rest of the record as it was (story 37).
    expect(data.Played).toBe(false);
    expect((await gateway.getResumeItems()).map((item) => item.Id)).toEqual([]);
  });

  it('reads one Title in full, by id, with the fields the title page shows', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'reads-one-title',
      ...identity,
      token: tokenFor('reads-one-title'),
    });

    const [title] = await gateway.getTitles({ ids: ['movie-arrival'], detail: true });

    expect(title?.Id).toBe('movie-arrival');
    // The fields a Row never asks for, and the title page always does.
    expect(title?.Overview).toContain('linguist');
    expect(title?.People?.length).toBeGreaterThan(0);
    expect(title?.MediaStreams?.length).toBeGreaterThan(0);
    expect(title?.ImageTags?.Logo).toBeDefined();
    expect(title?.BackdropImageTags?.length).toBeGreaterThan(0);
    // `enableUserData` is off on a Row's query, and a title page needs it: the
    // watched state is a `UserData` field.
    expect(title?.UserData).toBeDefined();
  });

  it('answers with nothing for an id that is not a Movie or a Series', async () => {
    // The "only Movies and Series" rule lives in the gateway, so a hand-typed
    // address for an Episode or an album is the Server's to refuse rather than
    // a screen's to filter.
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'refuses-a-non-title',
      ...identity,
      token: tokenFor('refuses-a-non-title'),
    });

    expect(await gateway.getTitles({ ids: ['album-nocturnes'], detail: true })).toEqual([]);
    expect(await gateway.getTitles({ ids: ['episode-bluey-s2e3'], detail: true })).toEqual([]);
  });

  it('reads the Titles like a given one, for More like this', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'reads-similar',
      ...identity,
      token: tokenFor('reads-similar'),
    });

    const similar = await gateway.getSimilarTitles({ itemId: 'movie-arrival' });

    expect(similar.map((item) => item.Id)).toEqual(['series-severance', 'movie-heat']);
  });

  it('reads the Collections a Title is in', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'reads-collections',
      ...identity,
      token: tokenFor('reads-collections'),
    });

    const collections = await gateway.getCollectionsFor('movie-heat');

    expect(collections.map((item) => item.Name)).toEqual(['Crime Classics']);
  });

  it('reads the Titles this User has finished, most recently finished first', async () => {
    await setFakeState({
      played: { 'user-rafael': ['movie-heat', 'series-severance'] },
      lastPlayedDates: {
        'user-rafael': {
          'movie-heat': '2026-10-01T20:00:00Z',
          'series-severance': '2026-10-09T21:00:00Z',
        },
      },
    });
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'reads-played-titles',
      ...identity,
      token: tokenFor('reads-played-titles'),
    });

    const played = await gateway.getPlayedTitles();

    expect(played.map((item) => item.Id)).toEqual(['series-severance', 'movie-heat']);
  });

  it('reads Jellyfin’s own recommendations, which come back as categories', async () => {
    await setFakeState({
      played: { 'user-rafael': ['movie-heat'] },
      lastPlayedDates: { 'user-rafael': { 'movie-heat': '2026-10-01T20:00:00Z' } },
      movieRecommendations: { 'movie-heat': ['movie-arrival'] },
    });
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'reads-recommendations',
      ...identity,
      token: tokenFor('reads-recommendations'),
    });

    const categories = await gateway.getMovieRecommendations({ itemLimit: 5 });

    // A bare array of categories, each saying which Title it is about: a
    // different shape from every other Row's endpoint.
    expect(categories.map((category) => category.BaselineItemName)).toEqual(['Heat']);
    expect(categories[0]?.Items?.map((item) => item.Id)).toEqual(['movie-arrival']);
  });

  it('reads the Collections on the Server, and the Titles in one', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'reads-collection-titles',
      ...identity,
      token: tokenFor('reads-collection-titles'),
    });

    const collections = await gateway.getCollections();
    expect(collections.map((item) => item.Id)).toEqual(['boxset-crime-classics']);

    const inside = await gateway.getCollectionTitles({
      collectionId: 'boxset-crime-classics',
    });
    expect(inside.map((item) => item.Name)).toEqual(['Arrival', 'Heat']);
  });

  it('marks a Title watched and unwatched on the 12.x played routes', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'marks-played',
      ...identity,
      token: tokenFor('marks-played'),
    });

    await gateway.markPlayed('movie-heat');
    const [watched] = await gateway.getTitles({ ids: ['movie-heat'], detail: true });
    expect(watched?.UserData?.Played).toBe(true);

    await gateway.markUnplayed('movie-heat');
    const [again] = await gateway.getTitles({ ids: ['movie-heat'], detail: true });
    expect(again?.UserData?.Played).toBe(false);
  });

  /**
   * The four Quick Connect calls, at the paths 12.2.0 actually has (#9). The
   * endpoints this replaced are gone from the Server, so the point of asserting
   * on the recorded requests is that nothing here drifts back to one of them.
   */
  it('runs the whole Quick Connect flow on the 12.x endpoints', async () => {
    const deviceId = 'quick-connects';
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId,
      ...identity,
    });

    expect(await gateway.isQuickConnectEnabled()).toBe(true);

    const initiated = await gateway.initiateQuickConnect();
    expect(initiated.Code).toMatch(/^\d{6}$/);
    expect(initiated.Secret).toBeTruthy();
    expect(initiated.Authenticated).toBe(false);
    // The Server records the device that asked, which is the device the token
    // it eventually issues will belong to.
    expect(initiated.DeviceId).toBe(deviceId);

    // Nobody has approved it yet, so polling says exactly that.
    const waiting = await gateway.getQuickConnectState(initiated.Secret as string);
    expect(waiting.Authenticated).toBe(false);

    await approveQuickConnectCode(initiated.Code as string, 'user-rafael');

    const approved = await gateway.getQuickConnectState(initiated.Secret as string);
    expect(approved.Authenticated).toBe(true);

    const result = await gateway.authenticateWithQuickConnect(initiated.Secret as string);
    expect(result.User?.Name).toBe('Rafael');
    // The token belongs to the DeviceId that initiated, not to the device that
    // approved: that is the whole point of the flow.
    expect(result.AccessToken).toBe(`token-user-rafael-${deviceId}`);

    const paths = (await fakeRequests())
      .filter((request) => request.path.startsWith('/QuickConnect') || request.path.includes('QuickConnect'))
      .map((request) => `${request.method} ${request.path.split('?')[0] as string}`);
    expect(paths).toContain('GET /QuickConnect/Enabled');
    expect(paths).toContain('POST /QuickConnect/Initiate');
    expect(paths).toContain('GET /QuickConnect/Connect');
    expect(paths).toContain('POST /Users/AuthenticateWithQuickConnect');
  });

  it('answers 404 for a secret the Server has already spent', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'spends-a-secret',
      ...identity,
    });

    const initiated = await gateway.initiateQuickConnect();
    const secret = initiated.Secret as string;
    await approveQuickConnectCode(initiated.Code as string, 'user-marina');
    await gateway.authenticateWithQuickConnect(secret);

    // A consumed request is gone, which is the same answer an expired one
    // gives: there is nothing left to poll.
    await expect(gateway.getQuickConnectState(secret)).rejects.toMatchObject({ status: 404 });
  });

  it('refuses to exchange a secret nobody has approved', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: fakeJellyfinUrl(),
      deviceId: 'unapproved-secret',
      ...identity,
    });

    const initiated = await gateway.initiateQuickConnect();

    await expect(
      gateway.authenticateWithQuickConnect(initiated.Secret as string),
    ).rejects.toMatchObject({ status: 401 });
  });

  it('reports an unreachable Server as a transport failure', async () => {
    const gateway = createJellyfinGateway({
      serverAddress: 'http://127.0.0.1:1/',
      deviceId: 'unreachable',
      ...identity,
    });

    await expect(gateway.getPublicSystemInfo()).rejects.toThrow();
  });

  /**
   * One subtitle stream, fetched as text so the app can draw it itself (#27).
   *
   * The path is the **canonical form the Server generates for itself**, quoted
   * in `docs/research/jellyfin-playback.md` §14 out of
   * `MediaBrowser.Model/Dlna/StreamInfo.cs`:
   *
   *     /Videos/{itemId}/{mediaSourceId}/Subtitles/{index}/{startPositionTicks}/Stream.{format}
   *
   * Everything goes in the **path**. The same query parameters exist as legacy
   * aliases and `format` among them is annotated `[ParameterObsolete]`, so a
   * client that sends them is using the older spelling of the same request.
   */
  describe('fetching one subtitle track', () => {
    const subtitleGateway = () =>
      createJellyfinGateway({
        serverAddress: fakeJellyfinUrl(),
        deviceId: 'reads-subtitles',
        ...identity,
        token: tokenFor('reads-subtitles'),
      });

    it('builds the URL the Server builds for itself, with everything in the path', () => {
      const url = subtitleGateway().subtitleStreamUrl({
        itemId: 'movie-arrival',
        mediaSourceId: 'source-movie-arrival',
        index: 3,
        format: 'vtt',
      });

      expect(url).toBe(
        `${fakeJellyfinUrl()}/Videos/movie-arrival/source-movie-arrival/Subtitles/3/0/Stream.vtt?ApiKey=${tokenFor('reads-subtitles')}`,
      );
    });

    it('fetches the track as text, which is what the subtitle engine parses', async () => {
      const text = await subtitleGateway().getSubtitleText({
        itemId: 'movie-arrival',
        mediaSourceId: 'source-movie-arrival',
        index: 3,
        format: 'vtt',
      });

      expect(text.startsWith('WEBVTT')).toBe(true);
      expect(text).toContain('-->');
    });

    /**
     * §14's one case where the URL is not ours to build: an external stream
     * the Server has already given an address. `DeliveryUrl` is preferred
     * wherever the Server populated it, and it is server-relative, so making
     * it absolute is the only thing done to it — the same bargain
     * `TranscodingUrl` gets.
     */
    it('uses the Server’s own DeliveryUrl when it gave one, rather than building a second one', async () => {
      const text = await subtitleGateway().getSubtitleText({
        itemId: 'movie-arrival',
        mediaSourceId: 'source-movie-arrival',
        index: 3,
        format: 'vtt',
        deliveryUrl: '/Videos/movie-arrival/source-movie-arrival/Subtitles/4/0/Stream.vtt',
      });

      // Index 4 is Arrival's Spanish track, so the Server's URL was used and
      // not the one that would have been built from `index`.
      expect(text).toContain('Hola');
    });

    /**
     * #29: the styled file itself, which is what the renderer is handed and
     * what `flattenAss` reads when there is no renderer. The format is the
     * file extension, so one request gets ASS out of the same endpoint that
     * answers WebVTT.
     */
    it('fetches a styled track as ASS, which is the renderer’s own format', async () => {
      const text = await subtitleGateway().getSubtitleText({
        itemId: 'movie-arrival',
        mediaSourceId: 'source-movie-arrival',
        index: 5,
        format: 'ass',
      });

      expect(text).toContain('[Events]');
      expect(text).toContain('Dialogue:');
      // The style names an embedded font, which is what the attachments carry.
      expect(text).toContain('Heptapod Sans');
    });

    it('fails rather than answering with nothing when the Server refuses a track', async () => {
      await expect(
        subtitleGateway().getSubtitleText({
          itemId: 'movie-arrival',
          mediaSourceId: 'source-movie-arrival',
          index: 99,
          format: 'vtt',
        }),
      ).rejects.toMatchObject({ status: 404 });
    });
  });

  /**
   * The embedded fonts a styled subtitle file is drawn with (#29). A URL
   * rather than the bytes, because the renderer fetches it in its own worker —
   * so the token has to ride in the query, as the video's and the subtitles'
   * do, and the canonical path is the one the Server generates for itself.
   */
  describe('one embedded font attachment', () => {
    const attachmentGateway = () =>
      createJellyfinGateway({
        serverAddress: fakeJellyfinUrl(),
        deviceId: 'reads-attachments',
        ...identity,
        token: tokenFor('reads-attachments'),
      });

    it('builds the canonical Attachments path, with the token in the query', () => {
      expect(
        attachmentGateway().attachmentUrl({
          itemId: 'movie-arrival',
          mediaSourceId: 'source-movie-arrival',
          index: 1,
        }),
      ).toBe(
        `${fakeJellyfinUrl()}/Videos/movie-arrival/source-movie-arrival/Attachments/1?ApiKey=${tokenFor('reads-attachments')}`,
      );
    });

    /** The renderer fetches this itself, so the address has to really answer. */
    it('answers the font at that address', async () => {
      const response = await fetch(
        attachmentGateway().attachmentUrl({
          itemId: 'movie-arrival',
          mediaSourceId: 'source-movie-arrival',
          index: 0,
        }),
      );

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('font');
    });

    it('uses the Server’s own DeliveryUrl when it gave one', () => {
      expect(
        attachmentGateway().attachmentUrl({
          itemId: 'movie-arrival',
          mediaSourceId: 'source-movie-arrival',
          index: 1,
          deliveryUrl: '/Videos/movie-arrival/source-movie-arrival/Attachments/0',
        }),
      ).toBe(`${fakeJellyfinUrl()}/Videos/movie-arrival/source-movie-arrival/Attachments/0`);
    });
  });


  /**
   * The intro and credits markers (#31), from `jellyfin-playback.md` §12:
   *
   *     GET /MediaSegments/{itemId}?includeSegmentTypes={csv of MediaSegmentType}
   *
   * The types go in the query because the endpoint's own purpose is to narrow:
   * a Server with an intro-detection plugin may hold `Recap` and `Preview`
   * segments this app offers nothing for, and asking for them would be asking
   * the Server to send what nobody reads.
   */
  describe('reading the intro and credits markers', () => {
    const segmentGateway = () =>
      createJellyfinGateway({
        serverAddress: fakeJellyfinUrl(),
        deviceId: 'reads-segments',
        ...identity,
        token: tokenFor('reads-segments'),
      });

    it('reads an item’s segments, asking only for the types this app offers', async () => {
      await setFakeState({
        mediaSegments: {
          'episode-bluey-s1e1': [
            { Type: 'Intro', StartTicks: 0, EndTicks: 20_000_000 },
            { Type: 'Outro', StartTicks: 40_000_000, EndTicks: 60_000_000 },
          ],
        },
      });

      const segments = await segmentGateway().getMediaSegments('episode-bluey-s1e1', [
        'Intro',
        'Outro',
      ]);

      // Ticks are what the wire carries; turning them into seconds is
      // `src/playback/media-segments.ts`'s job, not the gateway's.
      expect(segments).toMatchObject([
        { Type: 'Intro', StartTicks: 0, EndTicks: 20_000_000 },
        { Type: 'Outro', StartTicks: 40_000_000, EndTicks: 60_000_000 },
      ]);

      const asked = (await fakeRequests()).find((request) =>
        request.path.startsWith('/MediaSegments/episode-bluey-s1e1'),
      );
      expect(asked?.path).toContain('includeSegmentTypes=Intro%2COutro');
    });

    /**
     * `decisions.md` §5: there is no `Credits` value in `MediaSegmentType`, so
     * a Server that holds a credits marker holds it as `Outro`. The enum is
     * `Unknown, Commercial, Preview, Recap, Outro, Intro`, and the two types
     * this app asks for are the only two it draws a button for.
     */
    it('leaves out the types it did not ask for, as the Server does', async () => {
      await setFakeState({
        mediaSegments: {
          'episode-bluey-s1e1': [
            { Type: 'Recap', StartTicks: 0, EndTicks: 10_000_000 },
            { Type: 'Intro', StartTicks: 10_000_000, EndTicks: 20_000_000 },
          ],
        },
      });

      const segments = await segmentGateway().getMediaSegments('episode-bluey-s1e1', [
        'Intro',
        'Outro',
      ]);

      expect(segments.map((segment) => segment.Type)).toEqual(['Intro']);
    });

    /**
     * §12: a Server with no segment provider installed may answer either an
     * empty result or a 404, and both mean "no markers". The gateway reports
     * the 404 as the failure it is; `media-segments.ts` is the one place the
     * two are made the same thing, so every caller gets one answer.
     */
    it('fails for an item the Server holds no segments for at all', async () => {
      await expect(segmentGateway().getMediaSegments('movie-heat')).rejects.toMatchObject({
        status: 404,
      });
    });
  });
});

/**
 * Approves a Quick Connect code the way the *other* Jellyfin app does: as a
 * User already signed in there, through `POST /QuickConnect/Authorize`, which
 * needs a token because on the real Server it does too.
 *
 * It goes through `fetch` rather than the gateway on purpose. Jellyflick is
 * only ever the device being approved, never the one approving, so the gateway
 * must not grow a method for an endpoint the app does not call — the approving
 * app is another app, and in a test that is this function.
 */
async function approveQuickConnectCode(code: string, userId: string): Promise<void> {
  const deviceId = `approves-${code}`;
  const response = await fetch(
    `${fakeJellyfinUrl()}/QuickConnect/Authorize?code=${encodeURIComponent(code)}&userId=${encodeURIComponent(userId)}`,
    {
      method: 'POST',
      headers: {
        Authorization: buildAuthorizationHeader({
          ...identity,
          deviceId,
          token: `token-${userId}-${deviceId}`,
        }),
      },
    },
  );
  if (!response.ok) {
    throw new Error(`Approving ${code} answered ${String(response.status)}`);
  }
}

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
