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
  MediaStreams?: { Type: string; Language?: string; DisplayTitle?: string }[];
  /** One tag per backdrop. The array index is the image's `imageIndex`. */
  BackdropImageTags?: string[];
  /** Keyed by `MetadataProvider` member name: `Imdb`, `Tmdb`, … */
  ProviderIds?: Record<string, string>;

  /** The fake's own field: which library serves this item. */
  libraryId: string;
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
  /** The Collections on the Server, and which Titles are in each (#17). */
  collections: FakeCollection[];
  /**
   * What `/Items/{itemId}/Similar` answers for each item, by item id. The real
   * Server works this out from genres and people; a fake owes a client only a
   * fixed relation it can assert on.
   */
  similar: Record<string, string[]>;
  /**
   * A status the `/UserPlayedItems` writes answer with, so a test can see what
   * marking a Title watched looks like when the Server refuses it. Null is the
   * normal Server.
   */
  failPlayedWritesWith: number | null;
  /**
   * A status `/Items/{itemId}/Similar` and `/Items/{itemId}/Collections` answer
   * with, so a test can see a title page whose extra Rows the Server will not
   * say anything about. Null is the normal Server.
   */
  failRelatedQueriesWith: number | null;
  /**
   * A status `AuthenticateByName` answers with whatever the credentials are, so
   * a test can see what a Server that is having a bad day looks like. Null is
   * the normal Server.
   */
  failAuthenticationWith: number | null;
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
};

const SERVER_ID = '0f1e2d3c4b5a69788796a5b4c3d2e1f0';

export function createSampleData(): FakeJellyfinState {
  return {
    failAuthenticationWith: null,
    failLibraryQueriesWith: null,
    failFavouriteQueriesWith: null,
    failFavouriteWritesWith: null,
    favourites: {},
    played: {},
    failPlayedWritesWith: null,
    failRelatedQueriesWith: null,
    failDisplayPreferencesWith: null,
    displayPreferences: {},
    libraries: SAMPLE_LIBRARIES.map((library) => ({ ...library })),
    items: SAMPLE_ITEMS.map((item) => ({ ...item })),
    collections: SAMPLE_COLLECTIONS.map((collection) => ({ ...collection })),
    similar: { ...SAMPLE_SIMILAR },
    users: [
      fakeUser({ Id: 'user-rafael', Name: 'Rafael', PrimaryImageTag: 'tag-rafael' }),
      fakeUser({ Id: 'user-marina', Name: 'Marina', PrimaryImageTag: 'tag-marina' }),
      // No picture, so the app has to fall back to initials.
      fakeUser({ Id: 'user-nico', Name: 'Nico', PrimaryImageTag: null }),
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
  },
  {
    Id: 'movie-paddington',
    Name: 'Paddington',
    Type: 'Movie',
    DateCreated: '2026-06-12T09:00:00Z',
    ImageTags: { Primary: 'tag-paddington' },
    Genres: ['Comedy', 'Family'],
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
    MediaStreams: [
      { Type: 'Video', Language: 'und' },
      { Type: 'Audio', Language: 'eng', DisplayTitle: 'English' },
      { Type: 'Audio', Language: 'fra', DisplayTitle: 'French' },
      { Type: 'Subtitle', Language: 'eng', DisplayTitle: 'English' },
      { Type: 'Subtitle', Language: 'spa', DisplayTitle: 'Spanish' },
    ],
    ProviderIds: { Imdb: 'tt2543164', Tmdb: '329865' },
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
    MediaStreams: [{ Type: 'Audio', Language: 'eng', DisplayTitle: 'English' }],
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
      { Type: 'Audio', Language: 'eng', DisplayTitle: 'English' },
      { Type: 'Subtitle', Language: 'eng', DisplayTitle: 'English' },
    ],
    ProviderIds: { Imdb: 'tt11280740' },
    libraryId: 'lib-series',
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
 * What `/Items/{itemId}/Similar` answers, by item id. Fixed rather than worked
 * out, so a test can assert on the Row: Arrival is like Severance and Heat, and
 * The Unfinished is like nothing at all, which is the empty case.
 */
const SAMPLE_SIMILAR: Readonly<Record<string, string[]>> = {
  'movie-arrival': ['series-severance', 'movie-heat'],
  'series-severance': ['movie-arrival'],
  'movie-heat': ['movie-arrival'],
};

/** An item as the Server serves it: the fake's own `libraryId` is not a field. */
export function servedViewOf(item: FakeItem): Omit<FakeItem, 'libraryId'> {
  const dto: Record<string, unknown> = { ...item };
  delete dto.libraryId;
  return dto as Omit<FakeItem, 'libraryId'>;
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
    Policy: { IsHidden: user.hidden ?? false, EnableContentDownloading: true },
    password: user.password ?? SAMPLE_PASSWORD,
  };
}

/** A user as the Server serves it: `UserDto` has no password field. */
export function publicViewOf(user: FakeUser): Omit<FakeUser, 'password'> {
  const dto: Record<string, unknown> = { ...user };
  delete dto.password;
  return dto as Omit<FakeUser, 'password'>;
}
