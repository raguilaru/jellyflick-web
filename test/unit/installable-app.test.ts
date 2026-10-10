/**
 * @vitest-environment node
 *
 * Installability is a property of the files the browser fetches, not of any
 * module, so the seam here is the shipped artifacts themselves:
 * `public/manifest.webmanifest`, the icon files beside it and the `<link>` in
 * `index.html`. Vite copies `public/` verbatim, so what this reads is what is
 * served; `test/e2e/installing-the-app.spec.ts` proves that end of it in a
 * real browser against the real build.
 *
 * The expected values are not derived from the manifest: they are the list
 * Chromium-based browsers require, quoted in
 * `docs/research/player-subtitles.md` §8c from MDN's "Making PWAs
 * installable".
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const PUBLIC = join(ROOT, 'public');

type ManifestIcon = {
  src: string;
  type: string;
  sizes: string;
  purpose?: string;
};

type Manifest = {
  name?: string;
  short_name?: string;
  start_url?: string;
  scope?: string;
  display?: string;
  background_color?: string;
  theme_color?: string;
  icons?: readonly ManifestIcon[];
  prefer_related_applications?: boolean;
};

async function readManifest(): Promise<Manifest> {
  return JSON.parse(await readFile(join(PUBLIC, 'manifest.webmanifest'), 'utf8')) as Manifest;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * A PNG's real dimensions, from the IHDR chunk: the first chunk of every PNG,
 * width and height as big-endian 32-bit integers at bytes 16 and 20. Read from
 * the file rather than trusted from the manifest, so a wrongly sized icon
 * cannot pass by being described correctly.
 */
async function pngSize(src: string): Promise<{ width: number; height: number }> {
  const bytes = await readFile(join(PUBLIC, src.replace(/^\//, '')));
  expect(bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return { width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20) };
}

describe('installing the app', () => {
  it('names itself, so the installed app is called Jellyflick', async () => {
    const manifest = await readManifest();

    expect(manifest.name).toBe('Jellyflick');
    expect(manifest.short_name).toBe('Jellyflick');
  });

  it('opens full-screen at the app root', async () => {
    const manifest = await readManifest();

    expect(manifest.start_url).toBe('/');
    expect(manifest.scope).toBe('/');
    expect(manifest.display).toBe('standalone');
  });

  it('asks to be installed rather than deferring to a native app', async () => {
    const manifest = await readManifest();

    // Chromium refuses to install when this is true. Absent is also fine, so
    // this allows either — what it rules out is the one value that breaks it.
    expect(manifest.prefer_related_applications ?? false).toBe(false);
  });

  it('declares the 192px and 512px PNG icons Chromium requires', async () => {
    const icons = (await readManifest()).icons ?? [];

    for (const required of ['192x192', '512x512']) {
      const match = icons.filter((icon) => icon.sizes === required && icon.type === 'image/png');
      expect(match.length, `no image/png icon declared at ${required}`).toBeGreaterThan(0);
    }
  });

  it('ships every icon it declares, at the size it declares', async () => {
    const icons = (await readManifest()).icons ?? [];

    expect(icons.length).toBeGreaterThan(0);
    for (const icon of icons) {
      const [width, height] = icon.sizes.split('x').map(Number);
      await expect(pngSize(icon.src), `${icon.src} is not ${icon.sizes}`).resolves.toEqual({
        width,
        height,
      });
    }
  });

  it('includes a maskable icon, so Android does not letterbox it into a circle', async () => {
    const icons = (await readManifest()).icons ?? [];

    const maskable = icons.filter((icon) => icon.purpose === 'maskable');
    expect(maskable.map((icon) => icon.sizes)).toContain('512x512');
  });

  it('matches the app, so installing it does not change how it looks', async () => {
    const manifest = await readManifest();
    const tokens = await readFile(join(ROOT, 'src', 'styles', 'base.css'), 'utf8');

    // `--surface-base` is the page's own background: the splash screen and the
    // installed window's title bar have to be that same colour.
    const surfaceBase = /--surface-base:\s*(#[0-9a-f]{6})/.exec(tokens)?.[1];
    expect(surfaceBase).toBeDefined();
    expect(manifest.background_color).toBe(surfaceBase);
    expect(manifest.theme_color).toBe(surfaceBase);
  });

  it('is linked from the document, with the same theme colour', async () => {
    const html = await readFile(join(ROOT, 'index.html'), 'utf8');
    const manifest = await readManifest();

    expect(html).toContain('rel="manifest"');
    expect(html).toContain('href="/manifest.webmanifest"');
    // iOS ignores the manifest's icons and reads this instead.
    expect(html).toContain('rel="apple-touch-icon"');
    expect(html).toContain(`<meta name="theme-color" content="${String(manifest.theme_color)}"`);
  });

  it('registers no service worker, so an update needs nothing cleared', async () => {
    // `decisions.md` §8 and `player-subtitles.md` §8c: a service worker is not
    // required for installability, and a registered one outlives the page that
    // registered it — a stale worker is exactly the "clear something" failure
    // story 110 must not have. So: no `sw.js`, and no registration anywhere.
    const sources = await Promise.all(
      ['src/main.tsx', 'src/app.tsx', 'index.html'].map((file) => readFile(join(ROOT, file), 'utf8')),
    );

    for (const source of sources) {
      expect(source).not.toContain('serviceWorker');
    }
    await expect(readFile(join(PUBLIC, 'sw.js'))).rejects.toThrow();
  });
});
