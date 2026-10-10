import type { AuthenticationResult } from '@jellyfin/sdk/lib/generated-client/models/authentication-result';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { BaseItemDtoQueryResult } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto-query-result';
import type { DisplayPreferencesDto } from '@jellyfin/sdk/lib/generated-client/models/display-preferences-dto';
import type { PublicSystemInfo } from '@jellyfin/sdk/lib/generated-client/models/public-system-info';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models/user-dto';
import type { UserItemDataDto } from '@jellyfin/sdk/lib/generated-client/models/user-item-data-dto';
import { buildAuthorizationHeader, type ServerIdentity } from './authorization';

/**
 * The only module that talks HTTP to the Server. A thin layer over `fetch`:
 * request and response shapes come from `@jellyfin/sdk`'s type definitions, none
 * of its runtime.
 *
 * Each ticket that needs a new endpoint adds one method here, and nowhere else.
 */
export type JellyfinGateway = {
  /** The address this gateway talks to, with no trailing slash. */
  readonly serverAddress: string;
  /**
   * The `Authorization` header every request from this gateway carries. A
   * gateway is created per (address, identity), so this is fixed for its
   * lifetime: a new token means a new gateway.
   */
  authorizationHeader(): string;
  /** `GET /System/Info/Public` — anonymous, and the source of the version gate. */
  getPublicSystemInfo(): Promise<PublicSystemInfo>;
  /**
   * `GET /Users/Public` — anonymous. Users whose `Policy.IsHidden` is true are
   * left out by the Server, which is why a typed username is also offered.
   */
  getPublicUsers(): Promise<UserDto[]>;
  /**
   * `POST /Users/AuthenticateByName`. The request carries this gateway's
   * identity *without* a token: that is how the Server records which device the
   * new token belongs to, so call it on a gateway built with no token.
   */
  authenticateByName(username: string, password: string): Promise<AuthenticationResult>;
  /**
   * `GET /Users/Me` — the signed-in User behind this gateway's token, and so
   * also the check that the token is still one the Server accepts.
   */
  getCurrentUser(): Promise<UserDto>;
  /**
   * The URL of a User's picture. Anonymous on the Server, so an `<img src>`
   * needs no token. There are no sizing parameters on this endpoint — size the
   * picture with CSS.
   */
  userImageUrl(userId: string, tag: string): string;
  /**
   * `GET /UserViews` — the libraries this token's User can see. The legacy
   * `/Users/{userId}/Views` is gone in 12.x, and this one answers with a query
   * result rather than a bare array.
   */
  getUserViews(): Promise<BaseItemDto[]>;
  /**
   * `GET /Items/Latest` — one library's newest additions, newest first.
   *
   * It answers for a single library, so a view of the whole Server means one
   * call per library. The response is a **bare array**, not a query result. The
   * Server's own `groupItems` is deliberately switched off: collapsing Episodes
   * into their Series is the caller's, which is the only place that has seen
   * every library.
   */
  getLatestItems(options: LatestItemsOptions): Promise<BaseItemDto[]>;
  /**
   * `GET /Items?isFavorite=true` — the Titles in the token User's My List.
   *
   * My List *is* Jellyfin's Favorites, so this is the same list every other
   * Jellyfin app shows: `isFavorite` is the Server's own filter over the whole
   * library, and `/UserFavoriteItems` below is what puts things in it.
   *
   * Ordered by `Name`, ascending, and **not** by `SortName`: a client that
   * inserts a Title it has just added has only the name to place it by, and
   * `SortName` strips articles, so the two would disagree about where "The
   * Unfinished" goes.
   */
  getFavouriteItems(options?: FavouriteItemsOptions): Promise<BaseItemDto[]>;
  /**
   * `POST /UserFavoriteItems/{itemId}` — adds an item to the token User's
   * Favorites. The 12.x replacement for `/Users/{userId}/FavoriteItems/{id}`,
   * which is gone (ADR 0001 bans the legacy routes anyway).
   */
  addToFavourites(itemId: string): Promise<UserItemDataDto>;
  /** `DELETE /UserFavoriteItems/{itemId}` — takes one back out again. */
  removeFromFavourites(itemId: string): Promise<UserItemDataDto>;
  /**
   * `GET /Items` — Titles across the whole Server, in name order.
   *
   * It is "Titles" rather than "items" because the query always asks for
   * `Movie,Series` and nothing else: Episodes, Seasons, music and stray video
   * files are the Server's to leave out, not a screen's to filter. `recursive`
   * is on, or the Server answers with the library folders themselves.
   */
  getTitles(options?: TitlesQueryOptions): Promise<BaseItemDto[]>;
  /**
   * `GET /Items/{itemId}/Similar` — the Titles the Server thinks are like a
   * given one, which is the title page's More like this Row (#17).
   *
   * The Server's own order is kept: "most like this first" is a property of the
   * answer, not something a client should sort away.
   */
  getSimilarTitles(options: SimilarTitlesOptions): Promise<BaseItemDto[]>;
  /**
   * `GET /Items/{itemId}/Collections` — the Collections one Title belongs to.
   * A Title in none is an empty answer rather than a failure.
   */
  getCollectionsFor(itemId: string): Promise<BaseItemDto[]>;
  /**
   * `POST /UserPlayedItems/{itemId}` — marks a Title watched (story 78). The
   * 12.x replacement for `/Users/{userId}/PlayedItems/{id}`, which is gone.
   */
  markPlayed(itemId: string): Promise<UserItemDataDto>;
  /** `DELETE /UserPlayedItems/{itemId}` — marks it unwatched again. */
  markUnplayed(itemId: string): Promise<UserItemDataDto>;
  /**
   * `GET /Genres` — the distinct genres the Server's Movies and Series are in,
   * in name order. The Server does the collecting, so a client never reads
   * every Title to find out what genres there are.
   *
   * Note there is no `recursive` on this endpoint: it is already the set across
   * everything the User can see.
   */
  getTitleGenres(): Promise<BaseItemDto[]>;
  /**
   * The URL of one of an item's images. Anonymous on the Server, so an
   * `<img src>` needs no token. The tag is the cache-buster: with it the URL
   * changes when the image does and is otherwise cacheable forever.
   */
  itemImageUrl(itemId: string, imageType: ItemImageType, options?: ItemImageOptions): string;
  /**
   * `GET /DisplayPreferences/{id}` — where a User's Client Settings are kept.
   *
   * `client` is a **required** query parameter, and it partitions storage, so
   * Jellyflick's settings never land in another client's. The Server mixes keys
   * of its own into `CustomPrefs` when it answers; stripping them is the
   * caller's, in `src/settings/client-settings.ts`.
   */
  getDisplayPreferences(options: DisplayPreferencesOptions): Promise<DisplayPreferencesDto>;
  /**
   * `POST /DisplayPreferences/{id}` — answers 204, not the stored DTO.
   *
   * The body carries the **whole** `CustomPrefs` set and the Server stores it
   * as given, so every write is a read-modify-write.
   */
  saveDisplayPreferences(
    options: DisplayPreferencesOptions & { preferences: DisplayPreferencesDto },
  ): Promise<void>;
};

export type DisplayPreferencesOptions = {
  /**
   * The preferences' own id. Not a GUID: the Server MD5s anything that is not
   * one, so a plain name is legal and stable.
   */
  id: string;
  /** Required by the Server, and what keeps one client's settings its own. */
  client: string;
  userId: string;
};

/** The `ImageType` values this app asks for. */
export type ItemImageType = 'Primary' | 'Backdrop' | 'Logo' | 'Thumb';

export type ItemImageOptions = {
  tag?: string;
  /** Asks the Server to resize, so a card does not download a full-size poster. */
  maxWidth?: number;
};

export type LatestItemsOptions = {
  /** The library to ask. Without one the Server answers across all of them. */
  parentId: string;
  limit?: number;
};

export type FavouriteItemsOptions = {
  limit?: number;
};

export type TitlesQueryOptions = {
  /** Jellyfin's own matching, which is more than a substring of the name. */
  searchTerm?: string;
  /** A genre *name*, which is what `genres` takes; `genreIds` takes GUIDs. */
  genre?: string;
  limit?: number;
  /**
   * Particular items, by id. One id is how the title page reads its Title: it
   * is `/Items` rather than `/Items/{itemId}` on purpose, so the query's
   * `includeItemTypes=Movie,Series` goes on protecting it and a hand-typed
   * address for an Episode or an album comes back empty instead of showing a
   * page for something the app does not show.
   */
  ids?: readonly string[];
  /**
   * Everything the title page shows and no Row needs: the overview, the cast,
   * the streams, the provider ids, the logo and backdrop artwork, and this
   * User's own data — which is where the watched state is. A Row leaves it off,
   * so a strip of twenty cards still costs a strip of twenty cards.
   */
  detail?: boolean;
};

export type SimilarTitlesOptions = {
  itemId: string;
  limit?: number;
};

export type JellyfinGatewayOptions = ServerIdentity & {
  serverAddress: string;
  /** Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
};

/**
 * The only `BaseItemKind`s this app shows, as `includeItemTypes` takes them.
 * Every Title query carries it, so "only Movies and Series" is one fact in one
 * place rather than a filter on each screen.
 */
const TITLE_ITEM_TYPES = 'Movie,Series';

/**
 * The `fields` a title page needs and a Row does not. The ratings,
 * `RunTimeTicks`, `ProductionYear` and `OfficialRating` are deliberately absent:
 * the Server sends all four unasked (`jellyfin-api.md` §4/§17), and naming a
 * field that is not one would be a quiet lie about where they come from.
 */
const TITLE_DETAIL_FIELDS = 'Overview,People,MediaStreams,ProviderIds';

/** Posters, and the artwork only a title page shows: a backdrop and a logo. */
const TITLE_DETAIL_IMAGE_TYPES = 'Primary,Backdrop,Logo,Thumb';

/** A request that reached the Server but came back with a non-2xx status. */
export class JellyfinHttpError extends Error {
  readonly status: number;

  constructor(method: string, path: string, status: number) {
    super(`${method} ${path} returned ${String(status)}`);
    this.name = 'JellyfinHttpError';
    this.status = status;
  }
}

/** A request that never reached the Server: wrong address, DNS, TLS, offline. */
export class JellyfinUnreachableError extends Error {
  /** What `fetch` threw. Not `Error.cause`, which is Chrome 93. */
  readonly reason: unknown;

  constructor(serverAddress: string, reason: unknown) {
    super(`Could not reach ${serverAddress}`);
    this.name = 'JellyfinUnreachableError';
    this.reason = reason;
  }
}

export function createJellyfinGateway(options: JellyfinGatewayOptions): JellyfinGateway {
  const serverAddress = normaliseServerAddress(options.serverAddress);
  const doFetch = options.fetch ?? globalThis.fetch.bind(globalThis);
  const authorization = buildAuthorizationHeader(options);

  async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
    let response: Response;
    try {
      response = await doFetch(`${serverAddress}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: authorization,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (reason) {
      throw new JellyfinUnreachableError(serverAddress, reason);
    }
    if (!response.ok) {
      throw new JellyfinHttpError(method, path, response.status);
    }
    return (await response.json()) as T;
  }

  /**
   * A request whose answer has no body. `response.json()` on a 204 throws, so
   * an endpoint that answers "No Content" needs its own shape rather than a
   * `request<void>`.
   */
  async function requestWithoutAnswer(method: string, path: string, body?: unknown): Promise<void> {
    let response: Response;
    try {
      response = await doFetch(`${serverAddress}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          Authorization: authorization,
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    } catch (reason) {
      throw new JellyfinUnreachableError(serverAddress, reason);
    }
    if (!response.ok) {
      throw new JellyfinHttpError(method, path, response.status);
    }
  }

  return {
    serverAddress,
    authorizationHeader: () => authorization,
    getPublicSystemInfo: () => request<PublicSystemInfo>('GET', '/System/Info/Public'),
    getPublicUsers: () => request<UserDto[]>('GET', '/Users/Public'),
    getCurrentUser: () => request<UserDto>('GET', '/Users/Me'),
    // The body field is `Pw`, not `Password`.
    authenticateByName: (username, password) =>
      request<AuthenticationResult>('POST', '/Users/AuthenticateByName', {
        Username: username,
        Pw: password,
      }),
    userImageUrl: (userId, tag) =>
      `${serverAddress}/UserImage?userId=${encodeURIComponent(userId)}&tag=${encodeURIComponent(tag)}`,

    getUserViews: () =>
      request<BaseItemDtoQueryResult>('GET', '/UserViews').then((result) => result.Items ?? []),

    getLatestItems: (options) =>
      request<BaseItemDto[]>(
        'GET',
        `/Items/Latest${query({
          parentId: options.parentId,
          // `DateCreated` is not returned unless it is asked for by name, and
          // without it there is nothing to merge libraries by.
          fields: 'DateCreated',
          // Posters only: the default is every image type, at every size.
          enableImageTypes: 'Primary',
          imageTypeLimit: 1,
          enableUserData: false,
          groupItems: false,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ),

    getFavouriteItems: (options = {}) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Items${query({
          isFavorite: true,
          // My List is a list of Titles: a favourited album or Episode is not
          // one, and the Server is the right place to leave them out.
          includeItemTypes: TITLE_ITEM_TYPES,
          // Without this the Server answers with the library folders.
          recursive: true,
          // `Name`, deliberately not `SortName`: see the note on the method.
          sortBy: 'Name',
          sortOrder: 'Ascending',
          // Posters only: the default is every image type, at every size.
          enableImageTypes: 'Primary',
          imageTypeLimit: 1,
          enableUserData: false,
          // The list itself says how long it is, so the Server can skip a COUNT.
          enableTotalRecordCount: false,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ).then((result) => result.Items ?? []),

    getTitles: (options = {}) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Items${query({
          // Only the two kinds the app shows, so the Server never sends an
          // Episode, a Season, an album or a stray video file at all.
          includeItemTypes: TITLE_ITEM_TYPES,
          // Without this the Server answers with the library folders.
          recursive: true,
          // Name order, so a term that matches several Titles comes back the
          // same way twice. Positionally paired with `sortBy`.
          sortBy: 'SortName',
          sortOrder: 'Ascending',
          // Posters only unless a title page asked for the rest: the default is
          // every image type, at every size.
          enableImageTypes:
            options.detail === true ? TITLE_DETAIL_IMAGE_TYPES : 'Primary',
          imageTypeLimit: 1,
          // The watched state is a `UserData` field, so a title page needs it
          // and a Row does not.
          enableUserData: options.detail === true,
          ...(options.detail === true ? { fields: TITLE_DETAIL_FIELDS } : {}),
          // Nothing shows a total, and asking for one costs the Server a COUNT.
          enableTotalRecordCount: false,
          ...(options.searchTerm === undefined ? {} : { searchTerm: options.searchTerm }),
          ...(options.genre === undefined ? {} : { genres: options.genre }),
          ...(options.ids === undefined ? {} : { ids: options.ids.join(',') }),
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ).then((result) => result.Items ?? []),

    getSimilarTitles: (options) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Items/${encodeURIComponent(options.itemId)}/Similar${query({
          // The Server's "like this" spans everything it holds, so the two
          // kinds the app shows are narrowed here as everywhere else.
          includeItemTypes: TITLE_ITEM_TYPES,
          enableImageTypes: 'Primary',
          imageTypeLimit: 1,
          enableUserData: false,
          enableTotalRecordCount: false,
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ).then((result) => result.Items ?? []),

    getCollectionsFor: (itemId) =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Items/${encodeURIComponent(itemId)}/Collections${query({
          enableImageTypes: 'Primary',
          imageTypeLimit: 1,
          enableTotalRecordCount: false,
        })}`,
      ).then((result) => result.Items ?? []),

    markPlayed: (itemId) =>
      request<UserItemDataDto>('POST', `/UserPlayedItems/${encodeURIComponent(itemId)}`),

    markUnplayed: (itemId) =>
      request<UserItemDataDto>('DELETE', `/UserPlayedItems/${encodeURIComponent(itemId)}`),

    addToFavourites: (itemId) =>
      request<UserItemDataDto>('POST', `/UserFavoriteItems/${encodeURIComponent(itemId)}`),

    removeFromFavourites: (itemId) =>
      request<UserItemDataDto>('DELETE', `/UserFavoriteItems/${encodeURIComponent(itemId)}`),

    getTitleGenres: () =>
      request<BaseItemDtoQueryResult>(
        'GET',
        `/Genres${query({
          // The genres of the Titles this app shows, so a music-only genre is
          // never offered as something to browse.
          includeItemTypes: TITLE_ITEM_TYPES,
          sortBy: 'SortName',
          sortOrder: 'Ascending',
          // A genre is browsed by its name, so its own artwork is not wanted.
          enableImages: false,
          enableTotalRecordCount: false,
        })}`,
      ).then((result) => result.Items ?? []),

    getDisplayPreferences: (options) =>
      request<DisplayPreferencesDto>('GET', `/DisplayPreferences/${displayPreferencesPath(options)}`),

    saveDisplayPreferences: (options) =>
      requestWithoutAnswer(
        'POST',
        `/DisplayPreferences/${displayPreferencesPath(options)}`,
        options.preferences,
      ),

    itemImageUrl: (itemId, imageType, options = {}) =>
      `${serverAddress}/Items/${encodeURIComponent(itemId)}/Images/${imageType}${query({
        ...(options.tag === undefined ? {} : { tag: options.tag }),
        ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
      })}`,
  };
}

/** The path and query both `/DisplayPreferences` calls share. */
function displayPreferencesPath(options: DisplayPreferencesOptions): string {
  return `${encodeURIComponent(options.id)}${query({
    client: options.client,
    userId: options.userId,
  })}`;
}

/**
 * A query string from values that are already decided. Numbers and booleans are
 * written the way Jellyfin reads them, and `URLSearchParams` does the escaping.
 */
function query(values: Readonly<Record<string, string | number | boolean>>): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(values)) {
    params.set(name, typeof value === 'string' ? value : String(value));
  }
  const search = params.toString();
  return search === '' ? '' : `?${search}`;
}

/** Trims whitespace and trailing slashes so paths can always be concatenated. */
export function normaliseServerAddress(address: string): string {
  return address.trim().replace(/\/+$/, '');
}
