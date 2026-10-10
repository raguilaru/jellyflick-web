import type { AuthenticationResult } from '@jellyfin/sdk/lib/generated-client/models/authentication-result';
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
};

export type JellyfinGatewayOptions = ServerIdentity & {
  serverAddress: string;
  /** Defaults to the global `fetch`. */
  fetch?: typeof globalThis.fetch;
};

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
  };
}

/** Trims whitespace and trailing slashes so paths can always be concatenated. */
export function normaliseServerAddress(address: string): string {
  return address.trim().replace(/\/+$/, '');
}
