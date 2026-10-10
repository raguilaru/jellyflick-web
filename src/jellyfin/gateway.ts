import type { PublicSystemInfo } from '@jellyfin/sdk/lib/generated-client/models/public-system-info';
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
  /** `GET /System/Info/Public` — anonymous, and the source of the version gate. */
  getPublicSystemInfo(): Promise<PublicSystemInfo>;
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

  async function request<T>(method: string, path: string): Promise<T> {
    let response: Response;
    try {
      response = await doFetch(`${serverAddress}${path}`, {
        method,
        headers: { Accept: 'application/json', Authorization: authorization },
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
    getPublicSystemInfo: () => request<PublicSystemInfo>('GET', '/System/Info/Public'),
  };
}

/** Trims whitespace and trailing slashes so paths can always be concatenated. */
export function normaliseServerAddress(address: string): string {
  return address.trim().replace(/\/+$/, '');
}
