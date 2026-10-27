/**
 * @vitest-environment node
 *
 * The licence texts the app owes for the code it serves (#48).
 *
 * Serving a component's bytes to a browser is distribution, so the texts have
 * to travel with the app. The seam is the shipped artifacts themselves —
 * `public/licences/` — exactly as `installable-app.test.ts` reads
 * `public/manifest.webmanifest`: Vite copies `public/` verbatim into `dist/`,
 * the container's server serves `dist/`, and the Dockerfile copies `dist/`
 * into the image, so what this reads is what is served and what ships.
 * `test/e2e/the-container-serves-the-app.spec.ts` proves that end of it
 * against the real build through the real server.
 *
 * The expected values are not derived from the notice. Every component below
 * was established from the installed package itself — its own `LICENSE` file,
 * the `license` field of its own `package.json`, the symbol and path strings
 * compiled into `node_modules/jassub/dist/wasm/jassub-worker.wasm`, and the
 * `name` table of `node_modules/jassub/dist/default.woff2` — and each is
 * present in `dist/` after a build. `docs/architecture.md` records how each
 * was checked.
 */
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const ROOT = join(import.meta.dirname, '..', '..');
const LICENCES = join(ROOT, 'public', 'licences');

function readLicence(name: string): Promise<string> {
  return readFile(join(LICENCES, name), 'utf8');
}

const NOTICE = 'NOTICE.txt';

/**
 * A component whose bytes reach a browser, and what the notice owes it.
 *
 * `licence` is the SPDX identifier the package itself declares; `text` is the
 * file in `public/licences/` carrying the full text, or `NOTICE.txt` when the
 * licence is short enough to be quoted in the notice itself — which is all MIT
 * asks, since its text *is* the notice.
 */
type Component = {
  /** As a reader looks for it in the notice. */
  name: string;
  licence: string;
  text: string;
  /** Where the corresponding source is, which is the LGPL's real obligation. */
  source: string;
};

const COMPONENTS: readonly Component[] = [
  // Compiled into the JASSUB WebAssembly. The names and versions come from the
  // strings in the `.wasm` itself, not from any manifest.
  {
    name: 'libass',
    licence: 'LGPL-2.1-or-later',
    text: 'LGPL-2.1.txt',
    source: 'github.com/libass/libass',
  },
  {
    name: 'FriBidi',
    licence: 'LGPL-2.1-or-later',
    text: 'LGPL-2.1.txt',
    source: 'github.com/fribidi/fribidi',
  },
  {
    name: 'FreeType',
    licence: 'FTL',
    text: 'FTL.txt',
    source: 'gitlab.freedesktop.org/freetype/freetype',
  },
  {
    name: 'HarfBuzz',
    licence: 'Old MIT',
    text: 'harfbuzz-MIT.txt',
    source: 'github.com/harfbuzz/harfbuzz',
  },

  // JavaScript the browser downloads.
  { name: 'jassub', licence: 'MIT', text: NOTICE, source: 'github.com/ThaUnknown/jassub' },
  {
    name: 'abslink',
    licence: 'Apache-2.0',
    text: 'Apache-2.0.txt',
    source: 'github.com/ThaUnknown/abslink',
  },
  {
    name: 'lfa-ponyfill',
    licence: 'MIT',
    text: NOTICE,
    source: 'github.com/ThaUnknown/lfa-ponyfill',
  },
  // `rvfc-polyfill` was here, and is deliberately gone: #57 aliased it out of
  // the build because it is GPL-3.0, so its bytes no longer reach a browser
  // and the notice no longer owes it an entry. The test named "claims no
  // licence for code it no longer ships" is what keeps it from drifting back.
  { name: 'libpgs', licence: 'MIT', text: NOTICE, source: 'github.com/Arcus92/libpgs-js' },
  {
    name: 'hls.js',
    licence: 'Apache-2.0',
    text: 'Apache-2.0.txt',
    source: 'github.com/video-dev/hls.js',
  },
  { name: 'Preact', licence: 'MIT', text: NOTICE, source: 'github.com/preactjs/preact' },

  // Fonts. Bebas Neue keeps its own text beside the font file it covers, which
  // is the precedent this directory follows.
  {
    name: 'Liberation Sans',
    licence: 'OFL-1.1',
    text: 'liberation-sans-OFL.txt',
    source: 'github.com/liberationfonts/liberation-fonts',
  },
  {
    name: 'Bebas Neue',
    licence: 'OFL-1.1',
    text: '../fonts/bebas-neue-OFL.txt',
    source: 'github.com/dharmatype/Bebas-Neue',
  },
];

describe('the licence texts that travel with the app', () => {
  it('has a notice a reader can start from', async () => {
    const notice = await readLicence(NOTICE);

    expect(notice).toContain('Jellyflick');
    // It has to say why these texts are here at all: the app serves this code.
    expect(notice.toLowerCase()).toContain('browser');
  });

  it('names every component whose bytes reach a browser', async () => {
    const notice = await readLicence(NOTICE);

    for (const component of COMPONENTS) {
      expect(notice, `${component.name} is not named in ${NOTICE}`).toContain(component.name);
    }
  });

  it('says which licence each component is under', async () => {
    const notice = await readLicence(NOTICE);

    for (const component of COMPONENTS) {
      expect(notice, `${component.name}'s licence is not stated`).toContain(component.licence);
    }
  });

  /**
   * The part of an LGPL notice people miss. A reader who wants the source of
   * the library we linked has to be able to find it from this file alone.
   */
  it('says where each component’s source is', async () => {
    const notice = await readLicence(NOTICE);

    for (const component of COMPONENTS) {
      expect(notice, `${component.name}'s source is not pointed at`).toContain(component.source);
    }
  });

  it('ships the full text every component is covered by', async () => {
    const notice = await readLicence(NOTICE);

    for (const component of COMPONENTS) {
      if (component.text === NOTICE) continue;
      // The notice points at the file...
      expect(notice, `${component.name} does not point at its licence text`).toContain(
        component.text.replace('../', ''),
      );
      // ...and the file is really there, with a text in it.
      const text = await readFile(join(LICENCES, component.text), 'utf8');
      expect(text.length, `${component.text} is empty`).toBeGreaterThan(500);
    }
  });

  it('carries no licence file the notice does not account for', async () => {
    const notice = await readLicence(NOTICE);
    const shipped = (await readdir(LICENCES)).filter((name) => name !== NOTICE);

    expect(shipped.length).toBeGreaterThan(0);
    for (const name of shipped) {
      expect(notice, `${name} is shipped but not mentioned in ${NOTICE}`).toContain(name);
    }
  });

  /**
   * The LGPL is the one here that is more than a notice, so its text is
   * checked to be the real one rather than a stub naming it.
   */
  it('ships the real copyleft text, not a summary of it', async () => {
    const lgpl = await readLicence('LGPL-2.1.txt');
    expect(lgpl).toContain('GNU LESSER GENERAL PUBLIC LICENSE');
    expect(lgpl).toContain('Version 2.1, February 1999');
    // The clause the obligation actually turns on.
    expect(lgpl).toContain('6. As an exception to the Sections above');
  });

  /**
   * The inverse of every test above, and the one #57 needed.
   *
   * A notice is a claim about what the browser is running, so claiming *too
   * much* is its own kind of wrong: it would have a reader believe they are
   * bound by GPL-3.0 terms, and have the project believe its own licence
   * choice is constrained, over code that is no longer in the bundle.
   *
   * `rvfc-polyfill` was removed from the build in #57 — `vite.config.ts`
   * aliases it to an empty module — so the notice and the text had to go with
   * it. `test/e2e/the-container-serves-the-app.spec.ts` holds up the other
   * end: that the code really is absent from the built chunks. The two tests
   * are a pair, and the pair is what keeps the notice honest in both
   * directions.
   */
  it('claims no licence for code it no longer ships', async () => {
    const notice = await readLicence(NOTICE);
    const shipped = await readdir(LICENCES);

    expect(notice).not.toContain('rvfc-polyfill');
    // The identifier, so a reader cannot conclude the bundle is GPL-3.0.
    expect(notice).not.toContain('GPL-3.0');
    expect(shipped).not.toContain('GPL-3.0.txt');
  });

  /**
   * MIT and the other short licences are satisfied by the copyright line and
   * the permission text travelling with the distribution, so those are in the
   * notice verbatim rather than merely referred to.
   */
  it('quotes the permission text of the notice-only licences', async () => {
    const notice = await readLicence(NOTICE);

    expect(notice).toContain('Permission is hereby granted, free of charge');
    // Each component's own copyright line, from its own LICENSE file.
    expect(notice).toContain('JASSUB contributors');
    expect(notice).toContain('David Schulte');
    expect(notice).toContain('Jason Miller');
  });

  /**
   * The texts are only owed because the code is served, so the two have to stay
   * in step: a new runtime dependency must not be able to arrive without its
   * notice. Every `dependencies` entry ships by definition.
   */
  it('accounts for every runtime dependency in package.json', async () => {
    const manifest = JSON.parse(await readFile(join(ROOT, 'package.json'), 'utf8')) as {
      dependencies?: Readonly<Record<string, string>>;
    };
    const notice = await readLicence(NOTICE);

    const declared = Object.keys(manifest.dependencies ?? {});
    expect(declared.length).toBeGreaterThan(0);
    for (const name of declared) {
      // `preact-iso` is covered by the Preact entry, which carries its licence.
      const looked = name === 'preact-iso' ? 'preact' : name;
      expect(
        notice.toLowerCase(),
        `${name} is a runtime dependency with no entry in ${NOTICE}`,
      ).toContain(looked.toLowerCase());
    }
  });
});
