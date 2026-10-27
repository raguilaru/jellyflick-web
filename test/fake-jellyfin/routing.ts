import type { FakeJellyfinState } from './data.ts';

export type FakeRequest = {
  method: string;
  pathname: string;
  query: URLSearchParams;
  /** Header names are lower-cased. */
  headers: Record<string, string>;
  /** Parsed JSON when the body was JSON, the raw string otherwise, undefined when empty. */
  body: unknown;
};

export type FakeResponse = {
  status: number;
  /** Serialised as JSON. Omit for 204, or when `bytes` carries the answer. */
  body?: unknown;
  /**
   * A body that is not JSON: the test video, or an HLS playlist. Set
   * `contentType` with it. This is the one endpoint family where a fake owes a
   * client real bytes — a `<video>` has to decode what it is given.
   */
  bytes?: Uint8Array;
  contentType?: string;
  /** Extra response headers, lower-cased, for `Content-Range` and friends. */
  headers?: Record<string, string>;
};

export type FakeRoute = {
  method: 'GET' | 'POST' | 'DELETE' | 'HEAD';
  /** Jellyfin path, with `:name` for a path parameter, e.g. `/Items/:itemId/Similar`. */
  path: string;
  handle(
    request: FakeRequest,
    state: FakeJellyfinState,
    params: Readonly<Record<string, string>>,
  ): FakeResponse;
};

export type RouteMatch = {
  route: FakeRoute;
  params: Record<string, string>;
};

/**
 * Finds the route for a request. Paths are matched case-insensitively, because
 * Jellyfin's own routing is, and segments are compared one by one so `:name`
 * parameters work without a regular-expression dialect of their own.
 */
export function matchRoute(
  routes: readonly FakeRoute[],
  method: string,
  pathname: string,
): RouteMatch | undefined {
  const wanted = segmentsOf(pathname);
  for (const route of routes) {
    if (route.method !== method) continue;
    const pattern = segmentsOf(route.path);
    if (pattern.length !== wanted.length) continue;

    const params: Record<string, string> = {};
    let matched = true;
    for (let i = 0; i < pattern.length; i += 1) {
      const expected = pattern[i] as string;
      const actual = wanted[i] as string;
      if (expected.startsWith(':')) {
        params[expected.slice(1)] = decodeURIComponent(actual);
        continue;
      }
      if (expected.toLowerCase() !== actual.toLowerCase()) {
        matched = false;
        break;
      }
    }
    if (matched) return { route, params };
  }
  return undefined;
}

function segmentsOf(path: string): string[] {
  return path.split('/').filter((segment) => segment.length > 0);
}
