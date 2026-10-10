/**
 * @vitest-environment node
 *
 * The container entrypoint is a shell script, so it is tested by running it:
 * the seam is "given this environment, what does it write and what does it
 * start". The one hard requirement is that the file it writes carries exactly
 * the keys `src/runtime-config.ts` reads — a mismatch there breaks the app
 * silently — and never the MDBList key (ADR 0004).
 */
import { execFile } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import type { RuntimeConfigFile } from '../../src/runtime-config';

const run = promisify(execFile);
const ENTRYPOINT = join(import.meta.dirname, '..', '..', 'deploy', 'entrypoint.sh');

type Started = { stdout: string; stderr: string; configDir: string };

async function start(
  environment: Record<string, string>,
  command: readonly string[] = ['true'],
  into?: string,
): Promise<Started> {
  const configDir = into ?? mkdtempSync(join(tmpdir(), 'jellyflick-config-'));
  const { stdout, stderr } = await run('sh', [ENTRYPOINT, ...command], {
    env: { PATH: process.env.PATH ?? '', JELLYFLICK_CONFIG_DIR: configDir, ...environment },
  });
  return { stdout, stderr, configDir };
}

/**
 * Reads the generated file the way a browser does: by executing it against a
 * bare `window`. That also proves the file is valid JavaScript.
 */
function readConfig(configDir: string): RuntimeConfigFile {
  const source = readFileSync(join(configDir, 'config.js'), 'utf8');
  const window: { __JELLYFLICK_CONFIG__?: RuntimeConfigFile } = {};
  new Function('window', source)(window);
  if (window.__JELLYFLICK_CONFIG__ === undefined) {
    throw new Error(`The generated config did not assign the global:\n${source}`);
  }
  return window.__JELLYFLICK_CONFIG__;
}

describe('the container entrypoint', () => {
  it('writes the preset Server address under exactly the keys the app reads', async () => {
    const { configDir } = await start({
      JELLYFIN_URL: 'https://jellyfin.example.lan',
      APP_VERSION: '1.4.0',
    });

    expect(readConfig(configDir)).toEqual({
      serverAddress: 'https://jellyfin.example.lan',
      appVersion: '1.4.0',
    });
  });

  it('treats an empty Server address as "ask the User", not as an error', async () => {
    const { configDir } = await start({ JELLYFIN_URL: '' });

    expect(readConfig(configDir).serverAddress).toBe('');
  });

  it('is equally happy with no Server address setting at all', async () => {
    const { configDir } = await start({});

    expect(readConfig(configDir).serverAddress).toBe('');
  });

  it('calls the version "dev" when the image was not stamped', async () => {
    const { configDir } = await start({ JELLYFIN_URL: '' });

    expect(readConfig(configDir).appVersion).toBe('dev');
  });

  it('never writes the MDBList key into the browser-visible file', async () => {
    const { configDir, stdout, stderr } = await start({
      JELLYFIN_URL: 'https://jellyfin.example.lan',
      MDBLIST_API_KEY: 'secret-key-42',
    });

    const source = readFileSync(join(configDir, 'config.js'), 'utf8');
    expect(source).not.toContain('secret-key-42');
    expect(stdout + stderr).not.toContain('secret-key-42');
  });

  it('escapes an address with quotes, backslashes and newlines instead of emitting broken JavaScript', async () => {
    const hostile = 'https://a.example.lan/"];\n window.stolen=1; //\\';

    const { configDir } = await start({ JELLYFIN_URL: hostile });

    expect(readConfig(configDir).serverAddress).toBe(hostile);
  });

  it('hands the process on to the command it was given, so signals reach the server', async () => {
    const { stdout } = await start({ JELLYFIN_URL: '' }, ['printf', 'the-server-started']);

    expect(stdout).toContain('the-server-started');
  });

  it('stops with an explanation when its directory is not writable, rather than serving a stale config', async () => {
    const unwritable = mkdtempSync(join(tmpdir(), 'jellyflick-locked-'));
    chmodSync(unwritable, 0o500);

    const failure: { code?: number; stderr?: string } | undefined = await start(
      { JELLYFIN_URL: '' },
      ['true'],
      unwritable,
    ).then(
      () => undefined,
      (reason: { code?: number; stderr?: string }) => reason,
    );

    expect(failure).toBeDefined();
    expect(failure?.code).not.toBe(0);
    expect(failure?.stderr).toContain(unwritable);
  });
});
