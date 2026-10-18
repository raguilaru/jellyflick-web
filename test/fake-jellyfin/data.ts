/**
 * In-memory sample data for the fake Jellyfin.
 *
 * Every later ticket grows this: add a field to `FakeJellyfinState`, seed it in
 * `createSampleData()`, and read it from a route module. `POST /__fake/state`
 * shallow-merges a patch over the whole object, so a test can change any of it
 * without a code change here.
 */

export type FakeSystemInfo = {
  LocalAddress: string;
  ServerName: string;
  Version: string;
  ProductName: string;
  Id: string;
  StartupWizardCompleted: boolean;
};

/**
 * A Jellyfin user account on the Server. `UserDto`-shaped, with the password the
 * fake checks kept alongside it — the real Server never returns one, so it is
 * stripped before a user is served.
 */
export type FakeUser = {
  Id: string;
  Name: string;
  ServerId: string;
  /** Null means the user has no picture, so the app shows initials instead. */
  PrimaryImageTag: string | null;
  HasPassword: boolean;
  HasConfiguredPassword: boolean;
  /** `UserPolicy.IsHidden`: a hidden user is left out of `/Users/Public`. */
  Policy: { IsHidden: boolean; EnableContentDownloading: boolean };
  /** The fake's own field: what `AuthenticateByName` accepts for this user. */
  password: string;
};

/**
 * A library on the Server, as `GET /UserViews` serves it. `CollectionType` is
 * what tells a client whether a library holds Titles at all: Jellyfin's own
 * values are `movies`, `tvshows`, `music`, `books`, `photos` and friends, and it
 * is absent on a library of mixed content.
 */
export type FakeLibrary = {
  Id: string;
  Name: string;
  Type: 'CollectionFolder';
  CollectionType?: string;
};

/**
 * One item in a library: a Movie, a Series, a Season, an Episode, or one of the
 * kinds the app does not show. `BaseItemDto`-shaped, with the library it belongs
 * to kept alongside it — the real Server answers per library through `parentId`
 * rather than returning the id on the item, so it is stripped before serving.
 */
export type FakeItem = {
  Id: string;
  Name: string;
  /** A `BaseItemKind`: `Movie`, `Series`, `Season`, `Episode`, `Video`, … */
  Type: string;
  DateCreated: string;
  /** Keyed by `ImageType`. Omitted entirely when the item has no image at all. */
  ImageTags?: Record<string, string>;
  /**
   * Genre *names*, which is what `/Items?genres=` matches on and what `/Genres`
   * is the distinct set of. Omitted on an item the Server has not classified.
   */
  Genres?: string[];
  /** Set on a Season and an Episode: which Series it belongs to. */
  SeriesId?: string;
  SeriesName?: string;
  SeriesPrimaryImageTag?: string;
  /** The Season's number on a Season, the Episode's number on an Episode. */
  IndexNumber?: number;
  /** The Season's number, on an Episode. */
  ParentIndexNumber?: number;

  // What only a title page asks for (#17). Every one of them is optional, and
  // one sample Title deliberately has none of them, because "the Server left it
  // out" is the case a title page has to cope with.

  ProductionYear?: number;
  /** The age rating. Unguarded on the real Server, so `''` is possible too. */
  OfficialRating?: string;
  /** Jellyfin's 100-nanosecond ticks. Always sent by the real Server. */
  RunTimeTicks?: number;
  Overview?: string;
  /** The Rotten Tomatoes critic score, 0–100. */
  CriticRating?: number | null;
  /** The community score, 0–10. The real Server omits it when it is not above zero. */
  CommunityRating?: number;
  People?: { Name: string; Type: string; Role?: string }[];
  /**
   * The tracks in the file. `Index` is the stream's **own** index, as the real
   * Server's is, which is what `AudioStreamIndex` and `SubtitleStreamIndex`
   * are set to — the picker (#27) and the subtitle route both read it, so a
   * client that used a position in this array instead is caught.
   */
  MediaStreams?: FakeMediaStream[];
  /** One tag per backdrop. The array index is the image's `imageIndex`. */
  BackdropImageTags?: string[];
  /** Keyed by `MetadataProvider` member name: `Imdb`, `Tmdb`, … */
  ProviderIds?: Record<string, string>;
  /**
   * The trailer links the metadata provider gave the Server, which in practice
   * are YouTube pages (#19, story 75). They are a field on the item, unlike
   * the *local* trailers in `state.localTrailers`, which is the real Server's
   * arrangement too: a remote trailer is a URL the item carries, a local one
   * is a file beside it.
   */
  RemoteTrailers?: { Name?: string; Url: string }[];

  /**
   * The fake's own field: the file behind this item, which is what
   * `POST /Items/{id}/PlaybackInfo` negotiates against (#25). An item without
   * one has nothing to play, which is a real answer the Server gives and a
   * client has to show.
   *
   * The *bytes* every source serves are the one committed test video; this says
   * what the Server **claims** the file is, which is all the negotiation reads.
   */
  media?: FakeMediaFile;

  /** The fake's own field: which library serves this item. */
  libraryId: string;
};

/**
 * One track in a file, as `MediaStream` has it. `Codec` is the ffprobe name,
 * and it is what tells a text subtitle from a graphical one
 * (`jellyfin-playback.md` §14) — `subrip` is drawn by the app, `pgssub` is not.
 */
export type FakeMediaStream = {
  Index: number;
  /** A `MediaStreamType`: `Video`, `Audio` or `Subtitle`. */
  Type: string;
  Codec?: string;
  Language?: string;
  DisplayTitle?: string;
  /** What the *file* was marked with, not what a User prefers. */
  IsDefault?: boolean;
  IsForced?: boolean;
};

/** What the Server says a file is, in the terms a DeviceProfile is matched in. */
export type FakeMediaFile = {
  Container: string;
  VideoCodec: string;
  /** Omitted for a file with no audio track, which the test video really is. */
  AudioCodec?: string;
  Height: number;
};

/**
 * One media segment — an intro or a credits marker — as `MediaSegmentDto` has
 * it (`jellyfin-playback.md` §12).
 *
 * `Type` is a `MediaSegmentType`, whose whole enum is `Unknown, Commercial,
 * Preview, Recap, Outro, Intro`: **there is no `Credits`**, and `Outro` is the
 * credits marker (`decisions.md` §5). Ticks are 100 ns, as everywhere on this
 * API, so a client that read them as milliseconds is caught here.
 *
 * `Id` and `ItemId` are filled in by the route from the item they are seeded
 * against, so a test writes only the three fields that say something.
 */
export type FakeMediaSegment = {
  Type: 'Unknown' | 'Commercial' | 'Preview' | 'Recap' | 'Outro' | 'Intro';
  StartTicks: number;
  EndTicks: number;
};

/**
 * A Collection — Jellyfin's `BoxSet` — and the Titles in it. The real Server
 * answers `/Items/{itemId}/Collections` with the BoxSets an item belongs to, so
 * the membership is held here rather than on the item.
 */
export type FakeCollection = {
  Id: string;
  Name: string;
  Type: 'BoxSet';
  ImageTags?: Record<string, string>;
  /** The fake's own field: which items are in this Collection. */
  itemIds: string[];
};

/**
 * One Quick Connect request the Server is holding, `QuickConnectResult`-shaped
 * with the User who approved it kept alongside — the real Server keeps that in
 * its own authorization record and never puts it in the response.
 *
 * The Server holds these only until they are spent: exchanging a secret for a
 * token removes the request, which is why polling one afterwards is a 404.
 */
export type FakeQuickConnectRequest = {
  Secret: string;
  /** Six digits, which is what the real Server shows the User. */
  Code: string;
  /** The device that asked, and so the device the token will belong to. */
  DeviceId: string;
  DeviceName: string;
  AppName: string;
  AppVersion: string;
  DateAdded: string;
  Authenticated: boolean;
  /** The fake's own field: who approved it, stripped before serving. */
  authorizedUserId: string | null;
};

/**
 * Quick Connect on the Server (#9). `POST /__fake/state` merges one level deep,
 * so a test that switches it off hands over the whole object rather than just
 * the flag.
 */
export type FakeQuickConnect = {
  /** What `GET /QuickConnect/Enabled` answers. An admin can turn it off. */
  enabled: boolean;
  requests: FakeQuickConnectRequest[];
  /**
   * How many codes have been issued, so each one is different and none is a
   * random number a test cannot predict. Monotonic rather than counted from
   * `requests`, which shrinks as requests are spent.
   */
  codesIssued: number;
  /**
   * A status `POST /QuickConnect/Initiate` answers with, so a test can see a
   * Server that will not hand out a code at all. Null is the normal Server,
   * and is also what a patch that leaves the field out means.
   */
  failInitiateWith?: number | null;
};

export type FakeJellyfinState = {
  systemInfo: FakeSystemInfo;
  users: FakeUser[];
  libraries: FakeLibrary[];
  items: FakeItem[];
  /**
   * Which items each User has marked as a favourite, by user id: Jellyfin's
   * Favorites, which this app calls My List. Per User, as the real Server has
   * it, so one User's list is never another's.
   *
   * Seeded empty, because an empty My List is where every User starts and
   * because a Row on Home that appeared in every other test would get in their
   * way. A test that needs a list patches this.
   */
  favourites: Record<string, string[]>;
  /**
   * Which items each User has marked watched, by user id — Jellyfin's
   * `UserData.Played`, which `/UserPlayedItems/{itemId}` writes (#17, story 78).
   * Per User, as the real Server has it, and seeded empty: every User starts
   * having watched nothing.
   */
  played: Record<string, string[]>;
  /**
   * Where each User has got to in each item, by user id then item id, in
   * Jellyfin's 100-nanosecond ticks — `UserData.PlaybackPositionTicks`, which
   * is the resume point (#25). The progress reports write it, so a test can
   * watch a position arrive and then be honoured by the next Play.
   */
  playbackPositions: Record<string, Record<string, number>>;
  /**
   * How many times each User has played each item, by user id then item id —
   * `UserData.PlayCount`. The **start** report increments it, as the real
   * Server does, and nothing else touches it: that is what makes "taking
   * something out of Continue Watching leaves the play count alone" (story 37)
   * a thing a test can hold, rather than a number derived from the resume
   * point that would fall to zero the moment the point was cleared.
   *
   * Seeded empty. A User the sample data says has *played* something and has no
   * count stored is served a count of one, which is the least a played item can
   * have.
   */
  playCounts: Record<string, Record<string, number>>;
  /**
   * When each User last played each item, by user id then item id, as the ISO
   * strings `UserData.LastPlayedDate` is served from — which is what Continue
   * Watching is ordered by (#12). The playback reports write it, as the real
   * Server does, and a test seeds it to get a household with a viewing history.
   */
  lastPlayedDates: Record<string, Record<string, string>>;
  /** The Collections on the Server, and which Titles are in each (#17). */
  collections: FakeCollection[];
  /**
   * The local trailer files beside each Title, by the Title's item id, as
   * `GET /Items/{itemId}/LocalTrailers` answers (#16, story 24).
   *
   * The trailers themselves are ordinary items in `items`, of Type `Trailer`
   * and with a `media` file, so the Billboard's trailer negotiates playback
   * exactly as a Title does. The *membership* is here rather than on the item,
   * the way a Collection's is: a trailer belongs to a Title, and neither the
   * real Server nor this one puts that on the item.
   *
   * Seeded for Arrival and Severance alone, so "this Title has a trailer" and
   * "this one has none" are both reachable without patching anything — story 25
   * is the Billboard falling back to the backdrop.
   */
  localTrailers: Record<string, string[]>;
  /**
   * What `/Items/{itemId}/Similar` answers for each item, by item id. The real
   * Server works this out from genres and people; a fake owes a client only a
   * fixed relation it can assert on.
   */
  similar: Record<string, string[]>;
  /**
   * What `GET /Movies/Recommendations` answers, by the id of the **Movie a
   * category is about** — its `BaselineItemName` (#15, story 43).
   *
   * The real Server works its categories out from what has been played lately,
   * so the fake keys them by the Movie and serves one category per played
   * Movie that has an entry, most recently played first. That is what makes
   * Because You Watched's two branches tellable apart: which Title the Row is
   * about follows `played` and `lastPlayedDates`, as it does on a real Server,
   * rather than being fixed whatever the household has watched.
   */
  movieRecommendations: Record<string, string[]>;
  /**
   * The intro and credits markers `GET /MediaSegments/{itemId}` answers, by
   * item id (#31).
   *
   * **Seeded empty, deliberately**, as `movieRecommendations` is. Segment data
   * is produced by a server-side provider — an intro-detection plugin — so a
   * Server with none installed holds no markers at all, and that is the state
   * most households are in. Seeding one would make "this Server has nothing to
   * skip" unreachable without patching, and it is the case every Title has to
   * cope with.
   *
   * A test that wants markers seeds them:
   * `{ 'episode-bluey-s1e1': [{ Type: 'Intro', StartTicks: 0, EndTicks: 2e7 }] }`.
   */
  mediaSegments: Record<string, FakeMediaSegment[]>;
  /**
   * A status the `/UserPlayedItems` writes answer with, so a test can see what
   * marking a Title watched looks like when the Server refuses it. Null is the
   * normal Server.
   */
  failPlayedWritesWith: number | null;
  /**
   * A status `POST /UserItems/{itemId}/UserData` answers with, so a test can
   * see what taking something out of Continue Watching looks like when the
   * Server refuses it. Null is the normal Server.
   */
  failUserItemDataWritesWith: number | null;
  /**
   * A status `/Items/{itemId}/Similar` and `/Items/{itemId}/Collections` answer
   * with, so a test can see a title page whose extra Rows the Server will not
   * say anything about. Null is the normal Server.
   */
  failRelatedQueriesWith: number | null;
  /**
   * A status `POST /Items/{itemId}/PlaybackInfo` answers with, so a test can
   * see what Play does when the Server will not say how to play something.
   * Null is the normal Server.
   */
  failPlaybackInfoWith: number | null;
  /**
   * A `PlaybackErrorCode` the Server answers `PlaybackInfo` with instead of a
   * playable source — `NotAllowed`, `NoCompatibleStream`, `RateLimitExceeded`.
   * Null is the normal Server, which sends no error code at all.
   */
  playbackErrorCode: string | null;
  /**
   * A status the `/Sessions/Playing` reports answer with, so a test can see a
   * Server that will not record progress. Null is the normal Server.
   */
  failPlaybackReportsWith: number | null;
  /**
   * A status the subtitle stream route answers with, so a test can see a
   * Server that holds a subtitle track it will not hand over (#27). Null is
   * the normal Server. It is separate from `failPlaybackInfoWith` because the
   * two are a different thing to a User: a Title that will not play at all,
   * against one that plays with nothing to read.
   */
  failSubtitleFetchWith: number | null;
  /**
   * A status `AuthenticateByName` answers with whatever the credentials are, so
   * a test can see what a Server that is having a bad day looks like. Null is
   * the normal Server.
   */
  failAuthenticationWith: number | null;
  /**
   * Access tokens the Server has dropped, as `POST /Sessions/Logout` does: a
   * token in here is no longer one any request can use. The real Server keeps
   * live sessions; the fake derives a token from the user and the DeviceId, so
   * the only thing it has to remember is which ones have been revoked.
   */
  revokedTokens: string[];
  /**
   * A status `POST /Sessions/Logout` answers with, so a test can see a Server
   * that will not drop a token. Null is the normal Server.
   */
  failSessionLogoutWith: number | null;
  /**
   * A status the library endpoints — `/UserViews` and `/Items/Latest` — answer
   * with whatever was asked, so a test can see what Home looks like when the
   * Server will not say what it holds. Null is the normal Server.
   */
  failLibraryQueriesWith: number | null;
  /**
   * A status `/Items` answers with when asked for a User's favourites, so a
   * test can see what My List looks like when the Server will not say what is
   * in it. Null is the normal Server.
   */
  failFavouriteQueriesWith: number | null;
  /**
   * A status the `/UserFavoriteItems` writes answer with, so a test can see
   * what adding or removing looks like when the Server refuses it. Null is the
   * normal Server.
   */
  failFavouriteWritesWith: number | null;
  /**
   * Stored `DisplayPreferences.CustomPrefs`, keyed
   * `<displayPreferencesId>|<client>|<userId>` — the three things the Server
   * partitions them by. This is where the Client Settings store's writes land.
   */
  displayPreferences: Record<string, Record<string, string | null>>;
  /**
   * A status the `/DisplayPreferences` endpoints answer with whatever was
   * asked, so a test can see a User whose settings the Server will not hand
   * over or keep. Null is the normal Server.
   */
  failDisplayPreferencesWith: number | null;
  /** Quick Connect: whether it is on, and the requests in flight (#9). */
  quickConnect: FakeQuickConnect;
  /**
   * Each User's `UserConfiguration`, by user id — their **Jellyfin** settings,
   * which every Jellyfin app shares, as against the per-client `CustomPrefs`
   * above. This is where the Playback Preferences store's writes land (#35).
   *
   * Per User and seeded empty, as `favourites` and `played` are: a User with
   * nothing stored gets `DEFAULT_USER_CONFIGURATION`, which is what the real
   * Server gives a new account. A test seeds this to get a User who has
   * already chosen, and it is its own top-level field rather than a member of
   * `FakeUser` because `POST /__fake/state` merges only one level deep —
   * patching a field on one user would otherwise mean restating all four.
   */
  userConfiguration: Record<string, FakeUserConfiguration>;
  /**
   * A status `/Users/Me` and `POST /Users/Configuration` answer with, so a test
   * can see a User whose Jellyfin settings the Server will not hand over or
   * keep. Null is the normal Server.
   */
  failUserConfigurationWith: number | null;
};

/**
 * `UserConfiguration` as 12.2.0 has it: the four fields this app shows, and
 * the rest as a loose bag so a field only another Jellyfin app writes can be
 * seeded and asserted on. A client POSTs the whole object, so what the fake
 * owes a test is proof that nothing was dropped on the way.
 */
export type FakeUserConfiguration = Record<string, unknown> & {
  AudioLanguagePreference?: string | null;
  SubtitleLanguagePreference?: string | null;
  /** `SubtitlePlaybackMode`: `Default`, `Always`, `OnlyForced`, `None`, `Smart`. */
  SubtitleMode?: string;
  EnableNextEpisodeAutoPlay?: boolean;
};

/**
 * What the real Server hands a User who has configured nothing. The two
 * language preferences are empty strings rather than absent, `SubtitleMode` is
 * `Default` and autoplay is on — the Server's own defaults, which is what
 * makes "a new User has next-Episode autoplay already" a fact a test can hold
 * rather than something this app decides.
 */
export const DEFAULT_USER_CONFIGURATION: FakeUserConfiguration = {
  AudioLanguagePreference: '',
  PlayDefaultAudioTrack: true,
  SubtitleLanguagePreference: '',
  DisplayMissingEpisodes: false,
  GroupedFolders: [],
  SubtitleMode: 'Default',
  DisplayCollectionsView: false,
  EnableLocalPassword: false,
  OrderedViews: [],
  LatestItemsExcludes: [],
  MyMediaExcludes: [],
  HidePlayedInLatest: true,
  RememberAudioSelections: true,
  RememberSubtitleSelections: true,
  EnableNextEpisodeAutoPlay: true,
  CastReceiverId: null,
};

const SERVER_ID = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';

export function createSampleData(): FakeJellyfinState {
  return {
    failAuthenticationWith: null,
    revokedTokens: [],
    failSessionLogoutWith: null,
    failLibraryQueriesWith: null,
    failFavouriteQueriesWith: null,
    failFavouriteWritesWith: null,
    favourites: {},
    played: {},
    playbackPositions: {},
    playCounts: {},
    lastPlayedDates: {},
    failUserItemDataWritesWith: null,
    failPlaybackInfoWith: null,
    playbackErrorCode: null,
    failPlaybackReportsWith: null,
    failSubtitleFetchWith: null,
    failPlayedWritesWith: null,
    failRelatedQueriesWith: null,
    failDisplayPreferencesWith: null,
    displayPreferences: {},
    // Quick Connect is on, as it is on a Server whose admin has enabled it,
    // and nothing is in flight: a request only exists once a device asks.
    quickConnect: { enabled: true, requests: [], codesIssued: 0, failInitiateWith: null },
    userConfiguration: {},
    failUserConfigurationWith: null,
    libraries: SAMPLE_LIBRARIES.map((library) => ({ ...library })),
    items: SAMPLE_ITEMS.map((item) => ({ ...item })),
    collections: SAMPLE_COLLECTIONS.map((collection) => ({ ...collection })),
    localTrailers: { ...SAMPLE_LOCAL_TRAILERS },
    similar: { ...SAMPLE_SIMILAR },
    movieRecommendations: { ...SAMPLE_MOVIE_RECOMMENDATIONS },
    // No segment provider on this Server until a test seeds one: see the note
    // on the field itself.
    mediaSegments: {},
    users: [
      fakeUser({ Id: 'user-rafael', Name: 'Rafael', PrimaryImageTag: 'tag-rafael' }),
      fakeUser({ Id: 'user-marina', Name: 'Marina', PrimaryImageTag: 'tag-marina' }),
      // No picture, so the app has to fall back to initials — and the one
      // User the Server does not allow to download, so story 77's "the
      // button is hidden" is a state a test can sign in to rather than one it
      // has to patch the Server into (#19).
      fakeUser({ Id: 'user-nico', Name: 'Nico', PrimaryImageTag: null, canDownload: false }),
      // Hidden from the public list: the only way in is to type the username.
      fakeUser({ Id: 'user-ghost', Name: 'Ghost', hidden: true }),
    ],
    systemInfo: {
      LocalAddress: 'http://127.0.0.1:8096',
      ServerName: 'Fake Jellyfin',
      Version: '12.2.0',
      ProductName: 'Jellyfin Server',
      Id: SERVER_ID,
      StartupWizardCompleted: true,
    },
  };
}

/** The password every sample user has, unless a test patches one. */
export const SAMPLE_PASSWORD = 'correct horse';

/**
 * Four libraries, so a client has to merge several and skip the ones that hold
 * no Titles: two of Movies, one of Series, and one of music.
 */
const SAMPLE_LIBRARIES: readonly FakeLibrary[] = [
  { Id: 'lib-movies', Name: 'Movies', Type: 'CollectionFolder', CollectionType: 'movies' },
  { Id: 'lib-kids', Name: 'Kids', Type: 'CollectionFolder', CollectionType: 'movies' },
  { Id: 'lib-series', Name: 'Series', Type: 'CollectionFolder', CollectionType: 'tvshows' },
  { Id: 'lib-music', Name: 'Music', Type: 'CollectionFolder', CollectionType: 'music' },
];

/**
 * The sample library, dated so that the newest additions interleave across
 * libraries and two Episodes of one Series are the newest of all. Newest first,
 * and the order a client should end up with is:
 *
 *   Bluey, Severance, Paddington, Arrival, Heat, The Unfinished
 *
 * which is every Movie and Series, each Series once, with the music library and
 * the stray Video left out.
 */
const SAMPLE_ITEMS: readonly FakeItem[] = [
  // Never seen by a client that skips libraries holding no Titles, even though
  // it is the newest addition on the whole Server.
  {
    Id: 'album-nocturnes',
    Name: 'Nocturnes',
    Type: 'MusicAlbum',
    DateCreated: '2026-06-18T09:00:00Z',
    ImageTags: { Primary: 'tag-nocturnes' },
    // A genre no Movie or Series has, so it must never be offered for browsing.
    Genres: ['Classical'],
    libraryId: 'lib-music',
  },

  // Two Episodes of one Series, added an hour apart: the Series is shown once,
  // in the place of the newer of them.
  {
    Id: 'episode-bluey-s2e3',
    Name: 'Sleepytime',
    Type: 'Episode',
    DateCreated: '2026-06-14T20:00:00Z',
    SeriesId: 'series-bluey',
    SeriesName: 'Bluey',
    SeriesPrimaryImageTag: 'tag-bluey',
    ParentIndexNumber: 2,
    IndexNumber: 3,
    libraryId: 'lib-kids',
    ImageTags: { Primary: 'tag-bluey-s2e3' },
    Overview: 'Bingo wants to sleep in her own bed.',
    // The real Server always sends a runtime, and a progress bar is a
    // fraction of it (#12).
    RunTimeTicks: 7 * 60 * 10_000_000,
    media: { Container: 'webm', VideoCodec: 'vp9', Height: 1080 },
  },
  {
    Id: 'episode-bluey-s2e2',
    Name: 'The Pool',
    Type: 'Episode',
    DateCreated: '2026-06-14T19:00:00Z',
    SeriesId: 'series-bluey',
    SeriesName: 'Bluey',
    SeriesPrimaryImageTag: 'tag-bluey',
    ParentIndexNumber: 2,
    IndexNumber: 2,
    libraryId: 'lib-kids',
    ImageTags: { Primary: 'tag-bluey-s2e2' },
    Overview: 'Dad forgets the floaties.',
    // The real Server always sends a runtime, and a progress bar is a
    // fraction of it (#12).
    RunTimeTicks: 7 * 60 * 10_000_000,
    media: { Container: 'webm', VideoCodec: 'vp9', Height: 1080 },
  },
  {
    Id: 'episode-severance-s2e4',
    Name: 'Woe’s Hollow',
    Type: 'Episode',
    DateCreated: '2026-06-13T18:00:00Z',
    SeriesId: 'series-severance',
    SeriesName: 'Severance',
    SeriesPrimaryImageTag: 'tag-severance',
    ParentIndexNumber: 2,
    IndexNumber: 4,
    libraryId: 'lib-series',
    // The real Server always sends a runtime, and a progress bar is a
    // fraction of it (#12).
    RunTimeTicks: 45 * 60 * 10_000_000,
    // Playable, like every other Episode in the library: the Billboard can
    // feature a Series, and its Play has to reach a real file (#16).
    media: { Container: 'webm', VideoCodec: 'vp9', Height: 1080 },
  },
  {
    Id: 'movie-paddington',
    Name: 'Paddington',
    Type: 'Movie',
    DateCreated: '2026-06-12T09:00:00Z',
    ImageTags: { Primary: 'tag-paddington' },
    // A backdrop and **no** logo, and no community rating either: the Title the
    // Billboard can feature but has to head with its own name in the logo font
    // (#16, story 32's preference being only a preference). Arrival and
    // Severance are the other way round — a backdrop and a logo both.
    BackdropImageTags: ['tag-paddington-backdrop'],
    Genres: ['Comedy', 'Family'],
    // A file whose only problem is its height, so "too tall to decode" is a
    // transcode reason a test can reach on its own.
    media: { Container: 'mp4', VideoCodec: 'h264', AudioCodec: 'aac', Height: 2160 },
    // A YouTube trailer and **no** local one, which is the other half of
    // story 75: Paddington is the Title whose Watch trailer loads an embed.
    RemoteTrailers: [{ Name: 'Paddington (Trailer)', Url: 'https://youtu.be/8sTR9vgnJ4s' }],
    libraryId: 'lib-kids',
  },
  // Older than Arrival, so Severance's place in a Row comes from the Episode
  // above and not from this one.
  {
    Id: 'episode-severance-s2e3',
    Name: 'Who Is Alive?',
    Type: 'Episode',
    DateCreated: '2026-06-11T08:00:00Z',
    SeriesId: 'series-severance',
    SeriesName: 'Severance',
    SeriesPrimaryImageTag: 'tag-severance',
    ParentIndexNumber: 2,
    IndexNumber: 3,
    libraryId: 'lib-series',
    // The real Server always sends a runtime, and a progress bar is a
    // fraction of it (#12).
    RunTimeTicks: 45 * 60 * 10_000_000,
    media: { Container: 'webm', VideoCodec: 'vp9', Height: 1080 },
  },
  // The richest Title on the Server: everything a title page can show is here,
  // so a missing field in the client is visible rather than indistinguishable
  // from a Server that did not say.
  {
    Id: 'movie-arrival',
    Name: 'Arrival',
    Type: 'Movie',
    DateCreated: '2026-06-10T09:00:00Z',
    ImageTags: { Primary: 'tag-arrival', Logo: 'tag-arrival-logo' },
    BackdropImageTags: ['tag-arrival-backdrop'],
    Genres: ['Science Fiction', 'Drama'],
    ProductionYear: 2016,
    OfficialRating: 'PG-13',
    RunTimeTicks: 116 * 60 * 10_000_000,
    Overview: 'A linguist is asked to talk to the visitors.',
    CriticRating: 94,
    CommunityRating: 7.9,
    People: [
      { Name: 'Amy Adams', Type: 'Actor', Role: 'Louise Banks' },
      { Name: 'Jeremy Renner', Type: 'Actor', Role: 'Ian Donnelly' },
      { Name: 'Denis Villeneuve', Type: 'Director' },
    ],
    // Two of each, which is what makes Arrival the Title the track picker
    // (#27) is tested against. The indexes are the streams' **own**, as the
    // real Server's are, and `AudioStreamIndex`/`SubtitleStreamIndex` are set
    // to these rather than to a position in this array.
    MediaStreams: [
      { Index: 0, Type: 'Video', Codec: 'vp9', Language: 'und' },
      { Index: 1, Type: 'Audio', Codec: 'opus', Language: 'eng', DisplayTitle: 'English', IsDefault: true },
      { Index: 2, Type: 'Audio', Codec: 'opus', Language: 'fra', DisplayTitle: 'French' },
      { Index: 3, Type: 'Subtitle', Codec: 'subrip', Language: 'eng', DisplayTitle: 'English' },
      { Index: 4, Type: 'Subtitle', Codec: 'subrip', Language: 'spa', DisplayTitle: 'Spanish' },
    ],
    ProviderIds: { Imdb: 'tt2543164', Tmdb: '329865' },
    // Arrival has a trailer file beside it **and** a YouTube link, which is
    // the one Title that makes "the local trailer is preferred" a thing a
    // test can see rather than a rule it has to take on trust (#19).
    RemoteTrailers: [{ Name: 'Arrival (Trailer)', Url: 'https://www.youtube.com/watch?v=tFMo3UJ4B4g' }],
    // VP9 in WebM: what the committed test video really is, so a browser can
    // direct-play it and an end-to-end test can watch something.
    media: { Container: 'webm', VideoCodec: 'vp9', Height: 1080 },
    libraryId: 'lib-movies',
  },
  // A stray video file in a Movies library. Jellyfin really does serve these,
  // and they are not a Title, so no client should show it.
  {
    Id: 'video-holiday',
    Name: 'Holiday 2019',
    Type: 'Video',
    DateCreated: '2026-06-05T09:00:00Z',
    libraryId: 'lib-movies',
  },
  {
    Id: 'movie-heat',
    Name: 'Heat',
    Type: 'Movie',
    DateCreated: '2026-06-01T09:00:00Z',
    ImageTags: { Primary: 'tag-heat' },
    Genres: ['Crime', 'Drama'],
    ProductionYear: 1995,
    OfficialRating: 'R',
    RunTimeTicks: 170 * 60 * 10_000_000,
    Overview: 'A detective and a thief recognise each other.',
    CommunityRating: 8.3,
    People: [{ Name: 'Al Pacino', Type: 'Actor', Role: 'Vincent Hanna' }],
    // A **graphical** subtitle track, which is the one kind this app cannot
    // draw: `pgssub` is a Blu-ray bitmap, so #27's picker has to say so rather
    // than offer a track that would show nothing, and #30 is where it becomes
    // drawable. Heat is the right Title for it — a 4K Blu-ray rip is exactly
    // where PGS comes from.
    MediaStreams: [
      { Index: 0, Type: 'Video', Codec: 'hevc', Language: 'und' },
      { Index: 1, Type: 'Audio', Codec: 'eac3', Language: 'eng', DisplayTitle: 'English', IsDefault: true },
      { Index: 2, Type: 'Subtitle', Codec: 'pgssub', Language: 'eng', DisplayTitle: 'English (PGS)' },
    ],
    // 4K HEVC in Matroska with Dolby audio: the file nothing modest plays, so
    // the Server has to be asked to transcode it.
    media: { Container: 'mkv', VideoCodec: 'hevc', AudioCodec: 'eac3', Height: 2160 },
    libraryId: 'lib-movies',
  },
  // No images at all, so a card has to cope without artwork — and none of the
  // title page's own fields either, so "the Server left it out" is a Title a
  // test can open rather than a state it has to patch in.
  {
    Id: 'movie-unfinished',
    Name: 'The Unfinished',
    Type: 'Movie',
    DateCreated: '2026-05-20T09:00:00Z',
    Genres: ['Drama'],
    // Unguarded on the real Server, so an empty one really does arrive.
    OfficialRating: '',
    CriticRating: null,
    libraryId: 'lib-movies',
  },

  // The Series themselves. `/Items/Latest` answers with the newest Episodes
  // rather than these, but they hold the artwork their Episodes point at, and a
  // Season sits between the two.
  {
    Id: 'series-bluey',
    Name: 'Bluey',
    Type: 'Series',
    DateCreated: '2026-01-05T09:00:00Z',
    ImageTags: { Primary: 'tag-bluey' },
    Genres: ['Comedy', 'Family'],
    libraryId: 'lib-kids',
  },
  {
    Id: 'series-severance',
    Name: 'Severance',
    Type: 'Series',
    DateCreated: '2026-02-01T09:00:00Z',
    ImageTags: { Primary: 'tag-severance', Logo: 'tag-severance-logo' },
    BackdropImageTags: ['tag-severance-backdrop'],
    Genres: ['Drama', 'Science Fiction', 'Thriller'],
    ProductionYear: 2022,
    OfficialRating: 'TV-MA',
    RunTimeTicks: 50 * 60 * 10_000_000,
    Overview: 'Work and the rest of life are kept apart, surgically.',
    CommunityRating: 8.7,
    People: [{ Name: 'Adam Scott', Type: 'Actor', Role: 'Mark Scout' }],
    MediaStreams: [
      { Index: 1, Type: 'Audio', Codec: 'aac', Language: 'eng', DisplayTitle: 'English', IsDefault: true },
      { Index: 2, Type: 'Subtitle', Codec: 'subrip', Language: 'eng', DisplayTitle: 'English' },
    ],
    ProviderIds: { Imdb: 'tt11280740' },
    libraryId: 'lib-series',
  },
  // The local trailer files, which sit beside a Title rather than among the
  // Titles (#16, story 24). They are items like any other — `PlaybackInfo`
  // negotiates one exactly as it does a Movie — but no query for
  // `Movie,Series` reaches them, and `/Items/Latest` leaves them out the way
  // the real endpoint leaves out an extra. Which Title each belongs to is
  // `state.localTrailers`.
  //
  // Both are the committed WebM, so a browser really plays what the Billboard
  // attaches.
  {
    Id: 'trailer-arrival',
    Name: 'Arrival (Trailer)',
    Type: 'Trailer',
    DateCreated: '2026-06-10T09:00:00Z',
    media: { Container: 'webm', VideoCodec: 'vp9', Height: 1080 },
    libraryId: 'lib-movies',
  },
  {
    Id: 'trailer-severance',
    Name: 'Severance (Trailer)',
    Type: 'Trailer',
    DateCreated: '2026-02-01T09:00:00Z',
    media: { Container: 'webm', VideoCodec: 'vp9', Height: 1080 },
    libraryId: 'lib-series',
  },
  // A second trailer for one Title, so "the Server holds several and the
  // Billboard shows the first" is a thing a test can reach. It is not seeded
  // against any Title: a test that wants two patches `localTrailers`.
  {
    Id: 'trailer-heat',
    Name: 'Heat (Trailer)',
    Type: 'Trailer',
    DateCreated: '2026-06-01T09:00:00Z',
    media: { Container: 'webm', VideoCodec: 'vp9', Height: 1080 },
    libraryId: 'lib-movies',
  },

  /*
   * Bluey is the Series the title page's Seasons and Episodes (#18) are tested
   * against: two Seasons the Server holds as items, four Episodes between them,
   * and the one Episode in each state a list has to draw.
   *
   * Its Season 1 is deliberately **old** — older than anything else in the
   * sample library — for two reasons. The newest addition in Bluey's library is
   * still `episode-bluey-s2e3`, so the merged newest-first order is exactly
   * what it was; and nothing is recent enough to earn a Title Label (#14).
   */
  {
    Id: 'season-bluey-s1',
    Name: 'Season 1',
    Type: 'Season',
    DateCreated: '2026-01-06T09:00:00Z',
    SeriesId: 'series-bluey',
    SeriesName: 'Bluey',
    SeriesPrimaryImageTag: 'tag-bluey',
    IndexNumber: 1,
    libraryId: 'lib-kids',
  },
  {
    Id: 'season-bluey-s2',
    Name: 'Season 2',
    Type: 'Season',
    DateCreated: '2026-01-07T09:00:00Z',
    SeriesId: 'series-bluey',
    SeriesName: 'Bluey',
    SeriesPrimaryImageTag: 'tag-bluey',
    IndexNumber: 2,
    libraryId: 'lib-kids',
  },
  // Everything an Episode list draws: a still of its own, a description, a
  // length, and a file to play.
  {
    Id: 'episode-bluey-s1e1',
    Name: 'The Magic Xylophone',
    Type: 'Episode',
    DateCreated: '2026-01-08T09:00:00Z',
    SeriesId: 'series-bluey',
    SeriesName: 'Bluey',
    SeriesPrimaryImageTag: 'tag-bluey',
    ParentIndexNumber: 1,
    IndexNumber: 1,
    // On an Episode the `Primary` image is the still from the programme, not a
    // poster, and it is what the list shows.
    ImageTags: { Primary: 'tag-bluey-s1e1' },
    Overview: 'Bandit is frozen by a magic xylophone.',
    RunTimeTicks: 7 * 60 * 10_000_000,
    media: { Container: 'webm', VideoCodec: 'vp9', Height: 1080 },
    libraryId: 'lib-kids',
  },
  // And an Episode the Server said almost nothing about: no still, no
  // description and no length. A list has to draw it rather than skip it, which
  // is `The Unfinished`'s part played by an Episode.
  {
    Id: 'episode-bluey-s1e2',
    Name: 'Hotel',
    Type: 'Episode',
    DateCreated: '2026-01-09T09:00:00Z',
    SeriesId: 'series-bluey',
    SeriesName: 'Bluey',
    SeriesPrimaryImageTag: 'tag-bluey',
    ParentIndexNumber: 1,
    IndexNumber: 2,
    media: { Container: 'webm', VideoCodec: 'vp9', Height: 1080 },
    libraryId: 'lib-kids',
  },
  {
    Id: 'season-severance-s2',
    Name: 'Season 2',
    Type: 'Season',
    DateCreated: '2026-06-09T07:00:00Z',
    SeriesId: 'series-severance',
    SeriesName: 'Severance',
    SeriesPrimaryImageTag: 'tag-severance',
    IndexNumber: 2,
    libraryId: 'lib-series',
  },
];

/**
 * One Collection, holding two of the Movies. Only Heat and Arrival are in it,
 * so a Title that is in no Collection at all is the other case a title page has
 * to show — Bluey and Severance are both that.
 */
const SAMPLE_COLLECTIONS: readonly FakeCollection[] = [
  {
    Id: 'boxset-crime-classics',
    Name: 'Crime Classics',
    Type: 'BoxSet',
    ImageTags: { Primary: 'tag-crime-classics' },
    itemIds: ['movie-heat', 'movie-arrival'],
  },
];

/**
 * Which local trailers sit beside which Title (#16).
 *
 * Two of the three Titles the Billboard can feature have one, and Paddington
 * deliberately has none: that is story 25, the Billboard showing its backdrop
 * because there is no trailer to play.
 */
const SAMPLE_LOCAL_TRAILERS: Readonly<Record<string, string[]>> = {
  'movie-arrival': ['trailer-arrival'],
  'series-severance': ['trailer-severance'],
};

/**
 * What `/Items/{itemId}/Similar` answers, by item id. Fixed rather than worked
 * out, so a test can assert on the Row: Arrival is like Severance and Heat, and
 * The Unfinished is like nothing at all, which is the empty case.
 */
const SAMPLE_SIMILAR: Readonly<Record<string, string[]>> = {
  'movie-arrival': ['series-severance', 'movie-heat'],
  'series-severance': ['movie-arrival'],
  'movie-heat': ['movie-arrival'],
};

/**
 * What `/Movies/Recommendations` is about, by the Movie each category comes
 * from. Seeded empty: a Server only has recommendations once a household has
 * watched something, and every test that wants them seeds `played` anyway, so
 * seeding a relation here would make "nothing to go on yet" unreachable.
 */
const SAMPLE_MOVIE_RECOMMENDATIONS: Readonly<Record<string, string[]>> = {};

/**
 * An item as the Server serves it. The fake's own fields are not fields on a
 * `BaseItemDto`: the library an item belongs to is answered through `parentId`,
 * and what its file is comes from `PlaybackInfo` rather than from the item.
 */
export function servedViewOf(item: FakeItem): Omit<FakeItem, 'libraryId' | 'media'> {
  const dto: Record<string, unknown> = { ...item };
  delete dto.libraryId;
  delete dto.media;
  return dto as Omit<FakeItem, 'libraryId' | 'media'>;
}

/** A Collection as the Server serves it: the membership is not a field on it. */
export function servedCollectionViewOf(
  collection: FakeCollection,
): Omit<FakeCollection, 'itemIds'> {
  const dto: Record<string, unknown> = { ...collection };
  delete dto.itemIds;
  return dto as Omit<FakeCollection, 'itemIds'>;
}

function fakeUser(
  user: Pick<FakeUser, 'Id' | 'Name'> & {
    PrimaryImageTag?: string | null;
    hidden?: boolean;
    /** `UserPolicy.EnableContentDownloading`, which gates Download File. */
    canDownload?: boolean;
    password?: string;
  },
): FakeUser {
  return {
    Id: user.Id,
    Name: user.Name,
    ServerId: SERVER_ID,
    PrimaryImageTag: user.PrimaryImageTag ?? null,
    HasPassword: true,
    HasConfiguredPassword: true,
    Policy: {
      IsHidden: user.hidden ?? false,
      EnableContentDownloading: user.canDownload ?? true,
    },
    password: user.password ?? SAMPLE_PASSWORD,
  };
}

/** A user as the Server serves it: `UserDto` has no password field. */
export function publicViewOf(user: FakeUser): Omit<FakeUser, 'password'> {
  const dto: Record<string, unknown> = { ...user };
  delete dto.password;
  return dto as Omit<FakeUser, 'password'>;
}
