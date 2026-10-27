import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { createSampleData, type FakeJellyfinState } from './data.ts';
import { jellyfinRoutes } from './routes/index.ts';
import { matchRoute, type FakeRequest } from './routing.ts';

export type RecordedRequest = {
  method: string;
  path: string;
  /** Header names are lower-cased. */
  headers: Record<string, string>;
  body: unknown;
  at: string;
};

export type FakeJellyfin = {
  /** Base address, with no trailing slash. */
  url: string;
  port: number;
  close(): Promise<void>;
};

/**
 * A fake Jellyfin at the HTTP level: a real socket, real status codes, real
 * headers. Vitest starts it from `global-setup.ts`; Playwright starts the same
 * module from `bin.ts` as a `webServer`. Both runners assert on what was written
 * through `GET /__fake/writes`, so there is one mechanism and no bridging.
 *
 * Control endpoints (all outside Jellyfin's own namespace):
 *   GET    /__fake/health     → `{ ok: true }`
 *   GET    /__fake/requests   → every request, newest last
 *   DELETE /__fake/requests   → forget them
 *   GET    /__fake/writes     → the non-GET requests only
 *   DELETE /__fake/writes     → forget them
 *   GET    /__fake/state      → the sample data
 *   POST   /__fake/state      → merge a patch over the sample data
 *   DELETE /__fake/state      → back to the seeded sample data
 */
export function startFakeJellyfin(options: { port?: number } = {}): Promise<FakeJellyfin> {
  let state: FakeJellyfinState = createSampleData();
  let recorded: RecordedRequest[] = [];

  const server = createServer((incoming, response) => {
    void handle(incoming, response);
  });

  async function handle(incoming: IncomingMessage, response: ServerResponse): Promise<void> {
    allowCrossOrigin(incoming, response);
    if (incoming.method === 'OPTIONS') {
      response.writeHead(204).end();
      return;
    }

    const method = incoming.method ?? 'GET';
    const url = new URL(incoming.url ?? '/', 'http://127.0.0.1');
    const headers = lowerCasedHeaders(incoming);
    const body = parseBody(await readBody(incoming));

    // Control traffic is not recorded, so reading the log never changes it.
    if (url.pathname.startsWith('/__fake/')) {
      const control = handleControl(url.pathname, method, body);
      send(response, control.status, control.body);
      return;
    }

    recorded.push({
      method,
      path: url.pathname + url.search,
      headers,
      body,
      at: new Date().toISOString(),
    });

    const request: FakeRequest = {
      method,
      pathname: url.pathname,
      query: url.searchParams,
      headers,
      body,
    };
    const match = matchRoute(jellyfinRoutes, method, url.pathname);
    if (!match) {
      send(response, 404, {
        error: `The fake Jellyfin has no route for ${method} ${url.pathname}. Add one under test/fake-jellyfin/routes/.`,
      });
      return;
    }

    const result = match.route.handle(request, state, match.params);
    if (result.bytes !== undefined) {
      response.writeHead(result.status, {
        'Content-Type': result.contentType ?? 'application/octet-stream',
        'Content-Length': result.bytes.byteLength,
        ...(result.headers ?? {}),
      });
      response.end(result.bytes);
      return;
    }
    send(response, result.status, result.body);
  }

  function handleControl(
    pathname: string,
    method: string,
    body: unknown,
  ): { status: number; body?: unknown } {
    const writes = () => recorded.filter((entry) => entry.method !== 'GET' && entry.method !== 'HEAD');

    switch (`${method} ${pathname}`) {
      case 'GET /__fake/health':
        return { status: 200, body: { ok: true } };
      case 'GET /__fake/requests':
        return { status: 200, body: recorded };
      case 'DELETE /__fake/requests':
        recorded = [];
        return { status: 204 };
      case 'GET /__fake/writes':
        return { status: 200, body: writes() };
      case 'DELETE /__fake/writes':
        recorded = recorded.filter((entry) => entry.method === 'GET' || entry.method === 'HEAD');
        return { status: 204 };
      case 'GET /__fake/state':
        return { status: 200, body: state };
      case 'POST /__fake/state':
        state = mergeState(state, body);
        return { status: 200, body: state };
      case 'DELETE /__fake/state':
        state = createSampleData();
        return { status: 204 };
      default:
        return { status: 404, body: { error: `Unknown control endpoint ${method} ${pathname}` } };
    }
  }

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    server.listen(options.port ?? 0, '127.0.0.1', () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('The fake Jellyfin did not get a TCP port.'));
        return;
      }
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        port: address.port,
        close: () => closeServer(server),
      });
    });
  });
}

function allowCrossOrigin(incoming: IncomingMessage, response: ServerResponse): void {
  // The app is served from a different origin than the fake in Playwright, and
  // the MediaBrowser authorization header makes every request a preflighted one.
  // The requested headers are reflected rather than answered with `*`, which
  // only Chrome 97 and later accept.
  const requested = incoming.headers['access-control-request-headers'];
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, HEAD, OPTIONS');
  response.setHeader(
    'Access-Control-Allow-Headers',
    typeof requested === 'string' && requested.length > 0 ? requested : 'Authorization, Content-Type',
  );
  response.setHeader('Access-Control-Max-Age', '600');
}

function send(response: ServerResponse, status: number, body: unknown): void {
  if (status === 204 || body === undefined) {
    response.writeHead(status).end();
    return;
  }
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
  });
  response.end(payload);
}

function lowerCasedHeaders(incoming: IncomingMessage): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value === undefined) continue;
    headers[name.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
  }
  return headers;
}

function readBody(incoming: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    incoming.on('data', (chunk: Buffer) => chunks.push(chunk));
    incoming.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    incoming.on('error', reject);
  });
}

function parseBody(raw: string): unknown {
  if (raw.length === 0) return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/** Merges a patch one level deep, so a test can change a single system-info field. */
function mergeState(current: FakeJellyfinState, patch: unknown): FakeJellyfinState {
  if (patch === null || typeof patch !== 'object') return current;
  const merged = { ...current } as Record<string, unknown>;
  for (const [key, value] of Object.entries(patch as Record<string, unknown>)) {
    const existing = merged[key];
    if (isPlainObject(existing) && isPlainObject(value)) {
      merged[key] = { ...existing, ...value };
    } else {
      merged[key] = value;
    }
  }
  return merged as FakeJellyfinState;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
