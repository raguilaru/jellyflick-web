/**
 * The server inside the container image.
 *
 * ADR 0004 made the container a small service rather than a file server: it has
 * to hold `MDBLIST_API_KEY` server-side and cache ratings per Title, which no
 * static file server can do. So this is one dependency-free Node server doing
 * three things:
 *
 *   1. serve the built assets from `dist/`
 *   2. answer an unknown path with `index.html` and a **200**, so a client-side
 *      route survives a reload
 *   3. expose one ratings route that injects the MDBList key server-side and
 *      caches per Title, so the key never reaches a browser and the household
 *      shares one daily quota
 *
 * "Lightweight" in the spec is about the bundle a TV downloads, not about this
 * image, but there are still no runtime dependencies: only `node:` built-ins.
 */
import { createReadStream, promises as fs } from 'node:fs';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { join, normalize, sep } from 'node:path';

export type JellyflickServerOptions = {
  /** Directory holding the built assets. Read-only at runtime. */
  root: string;
  /**
   * Directory the entrypoint writes `config.js` into. Separate from `root`
   * because the image's filesystem is read-only and this one is a tmpfs.
   */
  configDir: string;
  /** Empty when the host left the setting blank: the ratings route then says so. */
  mdbListApiKey: string;
  port?: number;
  host?: string;
  /** How long a Title's ratings stay cached. Long by choice: the quota is 1,000 a day. */
  ratingsCacheTtlMs?: number;
  /** Bounds memory. The oldest entry is dropped when the cache is full. */
  ratingsCacheMaxEntries?: number;
  /** The upstream seam, so tests can stand in for MDBList without a network. */
  fetch?: typeof globalThis.fetch;
  /** The clock seam, so a test can age the cache without waiting. */
  now?: () => number;
  /** Where diagnostics go. Defaults to stdout. */
  log?: (message: string) => void;
};

export type JellyflickServer = {
  /** Base address, with no trailing slash. */
  url: string;
  port: number;
  close(): Promise<void>;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** How long a Title's ratings stay cached, and how many Titles are remembered. */
export const RATINGS_CACHE_DEFAULTS = { ttlMs: ONE_DAY_MS, maxEntries: 2000 };

/**
 * MDBList's own path shape, so provider and type pass straight through and this
 * route stays transport rather than translation. Ticket #20 shapes the payload.
 */
const MDBLIST_BASE = 'https://api.mdblist.com';
const RATINGS_PROVIDERS = ['imdb', 'tmdb', 'tvdb', 'trakt'] as const;
const RATINGS_MEDIA_TYPES = ['movie', 'show'] as const;
/** Deliberately narrow: an id is the only part of the upstream URL a caller picks. */
const RATINGS_ID = /^[A-Za-z0-9]{1,32}$/;

type CachedRatings = { status: number; body: string; expiresAt: number };

const CONTENT_TYPES: Readonly<Record<string, string>> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.txt': 'text/plain; charset=utf-8',
  '.vtt': 'text/vtt; charset=utf-8',
  '.wasm': 'application/wasm',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * The container's settings, read from its environment. `JELLYFIN_URL` is
 * deliberately absent: the preset Server address reaches the browser through
 * the config file the entrypoint writes, and the server has no use for it.
 */
export function optionsFromEnvironment(
  environment: Readonly<Partial<Record<string, string>>>,
): JellyflickServerOptions {
  return {
    root: environment.JELLYFLICK_ROOT ?? '/srv/app',
    configDir: environment.JELLYFLICK_CONFIG_DIR ?? '/srv/config',
    mdbListApiKey: environment.MDBLIST_API_KEY ?? '',
    port: positiveInteger(environment.PORT) ?? 8080,
    // Every interface: the request arrives from the host's reverse proxy, which
    // is another container or another machine.
    host: environment.HOST ?? '0.0.0.0',
    ratingsCacheTtlMs:
      (positiveInteger(environment.RATINGS_CACHE_TTL_SECONDS) ?? 0) * 1000 ||
      RATINGS_CACHE_DEFAULTS.ttlMs,
    ratingsCacheMaxEntries: RATINGS_CACHE_DEFAULTS.maxEntries,
  };
}

function positiveInteger(raw: string | undefined): number | undefined {
  if (raw === undefined || raw.trim() === '') return undefined;
  const value = Number(raw);
  return Number.isSafeInteger(value) && value > 0 ? value : undefined;
}

export function startJellyflickServer(options: JellyflickServerOptions): Promise<JellyflickServer> {
  const log = options.log ?? ((message: string) => process.stdout.write(`${message}\n`));
  const fetchUpstream = options.fetch ?? globalThis.fetch.bind(globalThis);
  const now = options.now ?? Date.now;
  const ttlMs = options.ratingsCacheTtlMs ?? RATINGS_CACHE_DEFAULTS.ttlMs;
  const maxEntries = options.ratingsCacheMaxEntries ?? RATINGS_CACHE_DEFAULTS.maxEntries;

  /** One entry per Title, so one lookup serves the whole household. */
  const ratingsCache = new Map<string, CachedRatings>();
  /** In-flight lookups, so a burst of browsers costs one upstream call. */
  const ratingsInFlight = new Map<string, Promise<CachedRatings | undefined>>();

  const server = createServer((incoming, response) => {
    void handle(incoming, response).catch((reason: unknown) => {
      log(`jellyflick: request failed: ${String(reason)}`);
      if (!response.headersSent) sendJson(response, 500, { error: 'internal-error' });
      else response.end();
    });
  });

  async function handle(incoming: IncomingMessage, response: ServerResponse): Promise<void> {
    const method = incoming.method ?? 'GET';
    if (method !== 'GET' && method !== 'HEAD') {
      sendJson(response, 405, { error: 'method-not-allowed' });
      return;
    }

    const url = new URL(incoming.url ?? '/', 'http://127.0.0.1');

    if (url.pathname === '/api/health') {
      sendJson(response, 200, { ok: true }, { 'Cache-Control': 'no-store' });
      return;
    }
    if (url.pathname === '/api/ratings' || url.pathname.startsWith('/api/ratings/')) {
      await serveRatings(url.pathname, response);
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      sendJson(response, 404, { error: 'unknown-route' }, { 'Cache-Control': 'no-store' });
      return;
    }

    await serveFile(url.pathname, method, response);
  }

  /**
   * `GET /api/ratings/:provider/:type/:id`. The key is added here and only
   * here, so it never reaches a browser (ADR 0004). The upstream body is passed
   * through unchanged: shaping it into a rating model is #20's job.
   */
  async function serveRatings(pathname: string, response: ServerResponse): Promise<void> {
    const segments = pathname.split('/').filter((segment) => segment.length > 0);
    // ['api', 'ratings', provider, type, id]
    const [, , provider, mediaType, id] = segments;
    const recognised =
      segments.length === 5 &&
      provider !== undefined &&
      mediaType !== undefined &&
      id !== undefined &&
      (RATINGS_PROVIDERS as readonly string[]).includes(provider) &&
      (RATINGS_MEDIA_TYPES as readonly string[]).includes(mediaType) &&
      RATINGS_ID.test(id);
    if (!recognised) {
      sendJson(response, 400, { error: 'bad-request' }, { 'Cache-Control': 'no-store' });
      return;
    }

    if (options.mdbListApiKey === '') {
      // The host left the setting empty, so extra ratings are simply off. #20
      // treats anything but a 200 as "no extra ratings" and omits them.
      sendJson(
        response,
        503,
        { error: 'mdblist-not-configured' },
        { 'Cache-Control': 'no-store' },
      );
      return;
    }

    const key = `${provider}/${mediaType}/${id}`;
    const cached = ratingsCache.get(key);
    if (cached !== undefined && cached.expiresAt > now()) {
      sendCachedRatings(response, cached);
      return;
    }
    ratingsCache.delete(key);

    const pending = ratingsInFlight.get(key) ?? lookUpRatings(key);
    ratingsInFlight.set(key, pending);
    let fresh: CachedRatings | undefined;
    try {
      fresh = await pending;
    } finally {
      ratingsInFlight.delete(key);
    }

    if (fresh === undefined) {
      sendJson(
        response,
        502,
        { error: 'mdblist-unavailable' },
        { 'Cache-Control': 'no-store' },
      );
      return;
    }
    sendCachedRatings(response, fresh);
  }

  /**
   * Returns the answer to cache, or undefined when MDBList could not be reached
   * or failed. A failure is never cached: a blip must not switch ratings off for
   * a whole TTL. A 404 *is* cached, because a Title MDBList has never heard of
   * would otherwise be looked up on every page view.
   */
  async function lookUpRatings(key: string): Promise<CachedRatings | undefined> {
    const target = new URL(`${MDBLIST_BASE}/${key}`);
    target.searchParams.set('apikey', options.mdbListApiKey);

    let upstream: Response;
    try {
      upstream = await fetchUpstream(target, { headers: { Accept: 'application/json' } });
    } catch (reason) {
      // The key is in `target`, so it is never part of what is logged.
      log(`jellyflick: MDBList unreachable for ${key}: ${String(reason)}`);
      return undefined;
    }

    if (upstream.status !== 200 && upstream.status !== 404) {
      log(`jellyflick: MDBList answered ${String(upstream.status)} for ${key}`);
      return undefined;
    }

    const body =
      upstream.status === 404 ? JSON.stringify({ error: 'not-found' }) : await upstream.text();
    const entry: CachedRatings = { status: upstream.status, body, expiresAt: now() + ttlMs };
    rememberRatings(key, entry);
    return entry;
  }

  function rememberRatings(key: string, entry: CachedRatings): void {
    ratingsCache.set(key, entry);
    // Insertion order, so the oldest entry goes first. Good enough: the set is
    // bounded by the size of one household's library.
    while (ratingsCache.size > maxEntries) {
      const oldest = ratingsCache.keys().next();
      if (oldest.done === true) break;
      ratingsCache.delete(oldest.value);
    }
  }

  function sendCachedRatings(response: ServerResponse, entry: CachedRatings): void {
    response.writeHead(entry.status, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Length': Buffer.byteLength(entry.body),
      'Cache-Control': `public, max-age=${String(Math.floor(ttlMs / 1000))}`,
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(entry.body);
  }

  async function serveFile(
    pathname: string,
    method: string,
    response: ServerResponse,
  ): Promise<void> {
    // The config file is written by the entrypoint into a tmpfs, so it is
    // served from there and not from the immutable asset directory.
    if (pathname === '/config.js') {
      const written = resolveWithin(options.configDir, '/config.js');
      if (written !== undefined && (await isFile(written))) {
        sendStream(response, 200, written, '.js', method, { 'Cache-Control': 'no-store' });
        return;
      }
      // Falls through to the placeholder in the build output, so the app still
      // boots if nothing wrote one.
    }

    const target = resolveWithin(options.root, pathname);
    if (target !== undefined && (await isFile(target))) {
      // The extension comes from the resolved file, not from the request path,
      // so `/` — which resolves to index.html — is served as HTML.
      sendStream(response, 200, target, extensionOf(target), method, {
        'Cache-Control': cacheControlFor(pathname),
      });
      return;
    }

    // A path that names a file — anything with an extension — is a build
    // artefact that should exist. Answering it with the shell would turn a
    // broken deploy into a mystifying blank page, so it 404s. Everything else
    // is a client-side route, and gets the shell with a 200 so a reload works.
    if (extensionOf(pathname) !== '') {
      sendJson(response, 404, { error: 'not-found' }, { 'Cache-Control': 'no-store' });
      return;
    }

    const shell = resolveWithin(options.root, '/index.html');
    if (shell === undefined || !(await isFile(shell))) {
      sendJson(response, 500, { error: 'no-app-shell' }, { 'Cache-Control': 'no-store' });
      return;
    }
    sendStream(response, 200, shell, '.html', method, { 'Cache-Control': 'no-cache' });
  }

  return new Promise((resolve, reject) => {
    server.on('error', reject);
    const host = options.host ?? '127.0.0.1';
    server.listen(options.port ?? 0, host, () => {
      const address = server.address();
      if (address === null || typeof address === 'string') {
        reject(new Error('The Jellyflick server did not get a TCP port.'));
        return;
      }
      resolve({
        url: `http://${host}:${String(address.port)}`,
        port: address.port,
        close: () => closeServer(server),
      });
    });
  });
}

/**
 * Resolves a request path inside a directory, or returns undefined when it
 * escapes — `..`, an absolute path or a NUL byte. Path traversal is the one way
 * a static server leaks the filesystem, so this is the only place a request
 * path becomes a file path.
 */
function resolveWithin(directory: string, pathname: string): string | undefined {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return undefined;
  }
  if (decoded.includes('\0')) return undefined;

  const relative = normalize(decoded).replace(/^[/\\]+/, '');
  if (relative === '' || relative === '.') return join(directory, 'index.html');
  if (relative === '..' || relative.startsWith(`..${sep}`)) return undefined;

  const resolved = join(directory, relative);
  const prefix = directory.endsWith(sep) ? directory : directory + sep;
  return resolved.startsWith(prefix) ? resolved : undefined;
}

function extensionOf(pathname: string): string {
  const lastSegment = pathname.slice(pathname.lastIndexOf('/') + 1);
  const dot = lastSegment.lastIndexOf('.');
  return dot <= 0 ? '' : lastSegment.slice(dot).toLowerCase();
}

/**
 * Hashed assets are immutable and cached hard. The shell and the generated
 * config must reflect a new deploy or new environment immediately, so neither
 * is cached.
 */
function cacheControlFor(pathname: string): string {
  if (pathname.startsWith('/assets/')) return 'public, max-age=31536000, immutable';
  if (pathname === '/config.js') return 'no-store';
  return 'no-cache';
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await fs.stat(path)).isFile();
  } catch {
    return false;
  }
}

function sendStream(
  response: ServerResponse,
  status: number,
  path: string,
  extension: string,
  method: string,
  headers: Record<string, string>,
): void {
  response.writeHead(status, {
    'Content-Type': CONTENT_TYPES[extension] ?? 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff',
    ...headers,
  });
  if (method === 'HEAD') {
    response.end();
    return;
  }
  createReadStream(path).pipe(response);
}

function sendJson(
  response: ServerResponse,
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): void {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...headers,
  });
  response.end(payload);
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeAllConnections();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}
