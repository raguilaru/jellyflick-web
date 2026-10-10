/**
 * @vitest-environment node
 *
 * The container's server is Node code, and happy-dom's `fetch` applies the
 * browser's Same Origin Policy, which would block every request to a server on
 * an ephemeral port. Node's own `fetch` is what a reverse proxy does anyway.
 */
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  optionsFromEnvironment,
  startJellyflickServer,
  type JellyflickServer,
} from '../../server/jellyflick-server';

/**
 * The container's own server, exercised over a real socket the way a browser
 * reaches it. The seam is `startJellyflickServer` plus HTTP: nothing here knows
 * how files are read or how the cache is stored.
 */

const INDEX_HTML = '<!doctype html><title>Jellyflick</title><div id="app"></div>';

function makeAssets(): { root: string; configDir: string } {
  const base = mkdtempSync(join(tmpdir(), 'jellyflick-server-'));
  const root = join(base, 'app');
  const configDir = join(base, 'config');
  mkdirSync(join(root, 'assets'), { recursive: true });
  mkdirSync(join(root, 'icons'), { recursive: true });
  mkdirSync(configDir, { recursive: true });
  writeFileSync(join(root, 'index.html'), INDEX_HTML);
  writeFileSync(join(root, 'assets', 'main-abc123.js'), 'export const hello = 1;\n');
  // The two unhashed artifacts an install needs. Their contents do not matter
  // here — `test/unit/installable-app.test.ts` owns what they say.
  writeFileSync(join(root, 'manifest.webmanifest'), '{"name":"Jellyflick"}');
  writeFileSync(join(root, 'icons', 'icon-192.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  return { root, configDir };
}

let running: JellyflickServer | undefined;

afterEach(async () => {
  await running?.close();
  running = undefined;
});

async function serve(
  overrides: Partial<Parameters<typeof startJellyflickServer>[0]> = {},
): Promise<string> {
  const { root, configDir } = makeAssets();
  running = await startJellyflickServer({ root, configDir, mdbListApiKey: '', ...overrides });
  return running.url;
}

describe('the container server serving the app', () => {
  it('serves a built asset with its own content type', async () => {
    const url = await serve();

    const response = await fetch(`${url}/assets/main-abc123.js`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/javascript; charset=utf-8');
    expect(await response.text()).toBe('export const hello = 1;\n');
  });

  it('serves the app shell at the root', async () => {
    const url = await serve();

    const response = await fetch(url);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toBe(INDEX_HTML);
  });

  it('answers a client-side route with the app shell and a 200, so a reload works', async () => {
    const url = await serve();

    const response = await fetch(`${url}/title/abc`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(await response.text()).toBe(INDEX_HTML);
  });

  it('answers a missing asset with a 404, so a bad build is not hidden behind the shell', async () => {
    const url = await serve();

    const response = await fetch(`${url}/assets/gone-999.js`);

    expect(response.status).toBe(404);
  });

  it('refuses a path that climbs out of the asset directory', async () => {
    const url = await serve();

    const response = await fetch(`${url}/assets/..%2f..%2f..%2fetc%2fpasswd`);

    expect(response.status).toBe(404);
  });

  it('lets a browser cache a hashed asset forever but never the shell', async () => {
    const url = await serve();

    const asset = await fetch(`${url}/assets/main-abc123.js`);
    const shell = await fetch(`${url}/title/abc`);

    expect(asset.headers.get('cache-control')).toBe('public, max-age=31536000, immutable');
    expect(shell.headers.get('cache-control')).toBe('no-cache');
  });

  it('serves the web app manifest as a manifest, or the browser will not install the app', async () => {
    const url = await serve();

    const response = await fetch(`${url}/manifest.webmanifest`);

    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/manifest+json');
  });

  it('revalidates the manifest and the icons, so a new one is picked up with nothing cleared', async () => {
    const url = await serve();

    const manifest = await fetch(`${url}/manifest.webmanifest`);
    const icon = await fetch(`${url}/icons/icon-192.png`);

    // Neither filename is hashed — an installed app keeps asking for these two
    // paths — so they must never be cached the way `/assets/` is.
    expect(manifest.headers.get('cache-control')).toBe('no-cache');
    expect(icon.headers.get('cache-control')).toBe('no-cache');
    expect(icon.headers.get('content-type')).toBe('image/png');
  });
});

describe('the runtime config the entrypoint wrote', () => {
  it('is served from the writable directory rather than the read-only build output', async () => {
    const { root, configDir } = makeAssets();
    writeFileSync(join(root, 'config.js'), 'window.__JELLYFLICK_CONFIG__ = { placeholder: 1 };\n');
    writeFileSync(
      join(configDir, 'config.js'),
      "window.__JELLYFLICK_CONFIG__ = {\"serverAddress\":\"https://jellyfin.example.lan\",\"appVersion\":\"1.4.0\"};\n",
    );
    running = await startJellyflickServer({ root, configDir, mdbListApiKey: '' });

    const response = await fetch(`${running.url}/config.js`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('https://jellyfin.example.lan');
  });

  it('is never cached, so a changed setting takes effect on the next reload', async () => {
    const { root, configDir } = makeAssets();
    writeFileSync(join(configDir, 'config.js'), 'window.__JELLYFLICK_CONFIG__ = {};\n');
    running = await startJellyflickServer({ root, configDir, mdbListApiKey: '' });

    const response = await fetch(`${running.url}/config.js`);

    expect(response.headers.get('cache-control')).toBe('no-store');
  });

  it('falls back to the build output placeholder, so the app still boots if nothing wrote one', async () => {
    const { root, configDir } = makeAssets();
    writeFileSync(join(root, 'config.js'), 'window.__JELLYFLICK_CONFIG__ = { placeholder: 1 };\n');
    running = await startJellyflickServer({ root, configDir, mdbListApiKey: '' });

    const response = await fetch(`${running.url}/config.js`);

    expect(response.status).toBe(200);
    expect(await response.text()).toContain('placeholder');
  });
});

/**
 * A stand-in for MDBList. The upstream is a system boundary, so it is the one
 * thing faked here; the cache, the routing and the key injection are all real.
 */
function fakeMdbList(
  answer: (url: string) => { status: number; body: unknown } | Promise<{ status: number; body: unknown }>,
): { fetch: typeof globalThis.fetch; calls: string[] } {
  const calls: string[] = [];
  const fetchUpstream = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    const { status, body } = await answer(url);
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    });
  }) as typeof globalThis.fetch;
  return { fetch: fetchUpstream, calls };
}

const MATRIX_RATINGS = {
  title: 'The Matrix',
  ratings: [
    { source: 'tomatoes', value: 83 },
    { source: 'metacritic', value: 73 },
  ],
};

describe('the ratings route', () => {
  it('injects the MDBList key server-side and never shows it to the browser', async () => {
    const upstream = fakeMdbList(() => ({ status: 200, body: MATRIX_RATINGS }));
    const url = await serve({ mdbListApiKey: 'secret-key-42', fetch: upstream.fetch });

    const response = await fetch(`${url}/api/ratings/imdb/movie/tt0133093`);
    const payload = await response.text();

    expect(response.status).toBe(200);
    expect(JSON.parse(payload)).toEqual(MATRIX_RATINGS);
    // The trailing slash is part of MDBList's own route template, not an
    // accident: docs/research/ratings-mdblist.md §19.
    expect(upstream.calls).toEqual([
      'https://api.mdblist.com/imdb/movie/tt0133093/?apikey=secret-key-42',
    ]);
    expect(payload).not.toContain('secret-key-42');
    expect(JSON.stringify([...response.headers])).not.toContain('secret-key-42');
  });

  it('serves a second request for the same Title from the cache, sparing the daily quota', async () => {
    const upstream = fakeMdbList(() => ({ status: 200, body: MATRIX_RATINGS }));
    const url = await serve({ mdbListApiKey: 'secret-key-42', fetch: upstream.fetch });

    const first = await fetch(`${url}/api/ratings/imdb/movie/tt0133093`);
    await first.text();
    const second = await fetch(`${url}/api/ratings/imdb/movie/tt0133093`);

    expect(second.status).toBe(200);
    expect(await second.json()).toEqual(MATRIX_RATINGS);
    expect(upstream.calls).toHaveLength(1);
  });

  it('caches per Title, so another Title is still fetched', async () => {
    const upstream = fakeMdbList(() => ({ status: 200, body: MATRIX_RATINGS }));
    const url = await serve({ mdbListApiKey: 'secret-key-42', fetch: upstream.fetch });

    await (await fetch(`${url}/api/ratings/imdb/movie/tt0133093`)).text();
    await (await fetch(`${url}/api/ratings/imdb/movie/tt0111161`)).text();

    expect(upstream.calls).toHaveLength(2);
  });

  it('asks again once the cached answer has aged out', async () => {
    const upstream = fakeMdbList(() => ({ status: 200, body: MATRIX_RATINGS }));
    let clock = 1_000_000;
    const url = await serve({
      mdbListApiKey: 'secret-key-42',
      fetch: upstream.fetch,
      ratingsCacheTtlMs: 60_000,
      now: () => clock,
    });

    await (await fetch(`${url}/api/ratings/imdb/movie/tt0133093`)).text();
    clock += 60_001;
    await (await fetch(`${url}/api/ratings/imdb/movie/tt0133093`)).text();

    expect(upstream.calls).toHaveLength(2);
  });

  it('collapses two simultaneous requests for one Title into a single upstream call', async () => {
    let release = (): void => undefined;
    const held = new Promise<void>((resolve) => {
      release = resolve;
    });
    const upstream = fakeMdbList(async () => {
      await held;
      return { status: 200, body: MATRIX_RATINGS };
    });
    const url = await serve({ mdbListApiKey: 'secret-key-42', fetch: upstream.fetch });

    const both = Promise.all([
      fetch(`${url}/api/ratings/imdb/movie/tt0133093`),
      fetch(`${url}/api/ratings/imdb/movie/tt0133093`),
    ]);
    // Both requests are now waiting on the same upstream call.
    await new Promise((resolve) => setTimeout(resolve, 20));
    release();
    const [first, second] = await both;

    expect(await first.json()).toEqual(MATRIX_RATINGS);
    expect(await second.json()).toEqual(MATRIX_RATINGS);
    expect(upstream.calls).toHaveLength(1);
  });

  it('says the feature is switched off when the host left the key empty', async () => {
    const upstream = fakeMdbList(() => ({ status: 200, body: MATRIX_RATINGS }));
    const url = await serve({ mdbListApiKey: '', fetch: upstream.fetch });

    const response = await fetch(`${url}/api/ratings/imdb/movie/tt0133093`);

    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: 'mdblist-not-configured' });
    expect(upstream.calls).toHaveLength(0);
  });

  it('remembers that MDBList has never heard of a Title, which also spares the quota', async () => {
    const upstream = fakeMdbList(() => ({ status: 404, body: { error: 'not found' } }));
    const url = await serve({ mdbListApiKey: 'secret-key-42', fetch: upstream.fetch });

    const first = await fetch(`${url}/api/ratings/imdb/movie/tt0000000`);
    await first.text();
    const second = await fetch(`${url}/api/ratings/imdb/movie/tt0000000`);
    await second.text();

    expect(first.status).toBe(404);
    expect(second.status).toBe(404);
    expect(upstream.calls).toHaveLength(1);
  });

  it('does not cache an upstream failure, so a blip does not switch ratings off for a day', async () => {
    let failing = true;
    const upstream = fakeMdbList(() =>
      failing ? { status: 500, body: { error: 'boom' } } : { status: 200, body: MATRIX_RATINGS },
    );
    const url = await serve({ mdbListApiKey: 'secret-key-42', fetch: upstream.fetch });

    const broken = await fetch(`${url}/api/ratings/imdb/movie/tt0133093`);
    const brokenBody = await broken.json();
    failing = false;
    const recovered = await fetch(`${url}/api/ratings/imdb/movie/tt0133093`);

    expect(broken.status).toBe(502);
    expect(brokenBody).toEqual({ error: 'mdblist-unavailable' });
    expect(recovered.status).toBe(200);
    expect(upstream.calls).toHaveLength(2);
  });

  it('turns an unreachable MDBList into a 502 rather than a crash', async () => {
    const unreachable = (() => Promise.reject(new Error('ENOTFOUND'))) as typeof globalThis.fetch;
    const url = await serve({ mdbListApiKey: 'secret-key-42', fetch: unreachable });

    const response = await fetch(`${url}/api/ratings/imdb/movie/tt0133093`);

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: 'mdblist-unavailable' });
  });

  it('accepts every provider and media type MDBList itself accepts', async () => {
    const upstream = fakeMdbList(() => ({ status: 200, body: MATRIX_RATINGS }));
    const url = await serve({ mdbListApiKey: 'secret-key-42', fetch: upstream.fetch });

    const statuses = await Promise.all(
      [
        '/api/ratings/imdb/movie/tt0133093',
        '/api/ratings/tmdb/movie/603',
        '/api/ratings/tvdb/show/73739',
        '/api/ratings/trakt/show/1390',
        '/api/ratings/mal/any/1',
        '/api/ratings/mdblist/any/12345',
        '/api/ratings/imdb/any/tt0133093',
      ].map(async (path) => (await fetch(`${url}${path}`)).status),
    );

    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 200]);
  });

  it('rejects a provider, type or id it does not recognise, so nothing is smuggled upstream', async () => {
    const upstream = fakeMdbList(() => ({ status: 200, body: MATRIX_RATINGS }));
    const url = await serve({ mdbListApiKey: 'secret-key-42', fetch: upstream.fetch });

    const statuses = await Promise.all(
      [
        '/api/ratings/omdb/movie/tt0133093',
        '/api/ratings/imdb/album/tt0133093',
        '/api/ratings/imdb/movie/tt0133093%3Fapikey%3Dstolen',
        '/api/ratings/imdb/movie/',
        '/api/ratings/imdb/movie/tt0133093/extra',
      ].map(async (path) => (await fetch(`${url}${path}`)).status),
    );

    expect(statuses).toEqual([400, 400, 400, 400, 400]);
    expect(upstream.calls).toHaveLength(0);
  });

  it('keeps the key out of its diagnostics', async () => {
    const lines: string[] = [];
    const unreachable = (() => Promise.reject(new Error('ENOTFOUND'))) as typeof globalThis.fetch;
    const url = await serve({
      mdbListApiKey: 'secret-key-42',
      fetch: unreachable,
      log: (message) => lines.push(message),
    });

    await (await fetch(`${url}/api/ratings/imdb/movie/tt0133093`)).text();

    expect(lines.join('\n')).not.toContain('secret-key-42');
  });
});

describe('the settings the container reads from its environment', () => {
  it('takes the MDBList key from MDBLIST_API_KEY, the name the compose file sets', () => {
    const options = optionsFromEnvironment({ MDBLIST_API_KEY: 'secret-key-42' });

    expect(options.mdbListApiKey).toBe('secret-key-42');
  });

  it('treats an absent MDBList key as the feature being switched off', () => {
    expect(optionsFromEnvironment({}).mdbListApiKey).toBe('');
  });

  it('serves the built assets and the written config from their own directories', () => {
    const options = optionsFromEnvironment({});

    expect(options.root).toBe('/srv/app');
    expect(options.configDir).toBe('/srv/config');
  });

  it('listens on 8080, so the container needs no privileges to bind', () => {
    expect(optionsFromEnvironment({}).port).toBe(8080);
    expect(optionsFromEnvironment({ PORT: '9000' }).port).toBe(9000);
  });

  it('listens on every interface, because the request arrives from the reverse proxy', () => {
    expect(optionsFromEnvironment({}).host).toBe('0.0.0.0');
  });

  it('caches ratings for a day unless the host says otherwise', () => {
    expect(optionsFromEnvironment({}).ratingsCacheTtlMs).toBe(86_400_000);
    expect(optionsFromEnvironment({ RATINGS_CACHE_TTL_SECONDS: '3600' }).ratingsCacheTtlMs).toBe(
      3_600_000,
    );
  });

  it('ignores a port or a TTL that is not a positive number, rather than listening on NaN', () => {
    const options = optionsFromEnvironment({ PORT: 'eight', RATINGS_CACHE_TTL_SECONDS: '-1' });

    expect(options.port).toBe(8080);
    expect(options.ratingsCacheTtlMs).toBe(86_400_000);
  });

  it('never reads JELLYFIN_URL: the preset address reaches the browser through config.js alone', () => {
    const options = optionsFromEnvironment({ JELLYFIN_URL: 'https://jellyfin.example.lan' });

    expect(JSON.stringify(options)).not.toContain('jellyfin.example.lan');
  });
});
