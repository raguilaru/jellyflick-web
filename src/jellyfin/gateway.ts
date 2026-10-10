import type { AuthenticationResult } from '@jellyfin/sdk/lib/generated-client/models/authentication-result';
import type { BaseItemDto } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto';
import type { BaseItemDtoQueryResult } from '@jellyfin/sdk/lib/generated-client/models/base-item-dto-query-result';
import type { PublicSystemInfo } from '@jellyfin/sdk/lib/generated-client/models/public-system-info';
import type { UserDto } from '@jellyfin/sdk/lib/generated-client/models/user-dto';
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
   * `GET /Items` — Titles across the whole Server, in name order.
   *
   * It is "Titles" rather than "items" because the query always asks for
   * `Movie,Series` and nothing else: Episodes, Seasons, music and stray video
   * files are the Server's to leave out, not a screen's to filter. `recursive`
   * is on, or the Server answers with the library folders themselves.
   */
  getTitles(options?: TitlesQueryOptions): Promise<BaseItemDto[]>;
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

export type TitlesQueryOptions = {
  /** Jellyfin's own matching, which is more than a substring of the name. */
  searchTerm?: string;
  /** A genre *name*, which is what `genres` takes; `genreIds` takes GUIDs. */
  genre?: string;
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
          // Posters only: the default is every image type, at every size.
          enableImageTypes: 'Primary',
          imageTypeLimit: 1,
          enableUserData: false,
          // Nothing shows a total, and asking for one costs the Server a COUNT.
          enableTotalRecordCount: false,
          ...(options.searchTerm === undefined ? {} : { searchTerm: options.searchTerm }),
          ...(options.genre === undefined ? {} : { genres: options.genre }),
          ...(options.limit === undefined ? {} : { limit: options.limit }),
        })}`,
      ).then((result) => result.Items ?? []),

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

    itemImageUrl: (itemId, imageType, options = {}) =>
      `${serverAddress}/Items/${encodeURIComponent(itemId)}/Images/${imageType}${query({
        ...(options.tag === undefined ? {} : { tag: options.tag }),
        ...(options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth }),
      })}`,
  };
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
