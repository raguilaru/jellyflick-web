/**
 * Draws `test/fake-jellyfin/media/test-video.webm`: the short video the fake
 * Jellyfin serves so an end-to-end test can really play something.
 *
 * Run by hand, output committed, exactly as `make-icons.mjs` is — the shipped
 * fixture then shows up in a diff and no test run depends on an encoder.
 *
 *     node scripts/make-test-video.mjs
 *
 * Why it is made this way: encoding video needs an encoder, and the repository
 * deliberately has no media dependencies. Two things already installed do have
 * one. Playwright's Chromium records a canvas with `MediaRecorder`, which gives
 * a genuine VP9 WebM; but a recording is a *live* stream, so its header carries
 * no duration and no cues and a browser can neither report its length nor seek
 * in it. Playwright's own bundled ffmpeg (used for its video recording) can
 * remux that into a seekable file without decoding anything, which is all
 * `-c copy` asks of it. Together they need nothing of ours.
 *
 * VP9 in WebM, deliberately: plain Chromium ships no H.264 or AAC, so an MP4
 * would not play in the browser Playwright runs.
 */
import { chromium } from '@playwright/test';
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

const OUTPUT = path.join('test', 'fake-jellyfin', 'media', 'test-video.webm');
const SECONDS = 6;
const WIDTH = 160;
const HEIGHT = 90;
const FRAMES_PER_SECOND = 10;

const recorded = `${OUTPUT}.recording`;
writeFileSync(recorded, await record());
remux(recorded, OUTPUT);
unlinkSync(recorded);
console.log(`wrote ${OUTPUT}`);

/** Records a canvas in Chromium and hands back the WebM bytes. */
async function record() {
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();
    await page.goto('about:blank');
    const base64 = await page.evaluate(
      async ({ seconds, width, height, framesPerSecond }) => {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext('2d');
        const recorder = new MediaRecorder(canvas.captureStream(framesPerSecond), {
          mimeType: 'video/webm;codecs=vp9',
        });
        const chunks = [];
        recorder.ondataavailable = (event) => chunks.push(event.data);
        const stopped = new Promise((resolve) => {
          recorder.onstop = resolve;
        });

        recorder.start();
        const startedAt = performance.now();
        // A sweeping bar, so the picture really changes and the encoder has
        // something to encode. It is also how a human can see the thing plays.
        await new Promise((resolve) => {
          const draw = () => {
            const elapsed = performance.now() - startedAt;
            context.fillStyle = '#141418';
            context.fillRect(0, 0, width, height);
            context.fillStyle = '#e61e28';
            context.fillRect((elapsed / (seconds * 1000)) * width, 0, 12, height);
            if (elapsed >= seconds * 1000) {
              resolve();
              return;
            }
            requestAnimationFrame(draw);
          };
          draw();
        });
        recorder.stop();
        await stopped;

        const bytes = new Uint8Array(await new Blob(chunks).arrayBuffer());
        let binary = '';
        for (const byte of bytes) binary += String.fromCharCode(byte);
        return btoa(binary);
      },
      { seconds: SECONDS, width: WIDTH, height: HEIGHT, framesPerSecond: FRAMES_PER_SECOND },
    );
    return Buffer.from(base64, 'base64');
  } finally {
    await browser.close();
  }
}

/**
 * Copies the recorded stream into a fresh WebM, which is what writes a duration
 * into the header and cues at the end. No codec is decoded or re-encoded.
 */
function remux(from, to) {
  const ffmpeg = findFfmpeg();
  // `file:` is explicit because this ffmpeg build has no `pipe:` protocol.
  const result = spawnSync(
    ffmpeg,
    ['-hide_banner', '-loglevel', 'error', '-i', `file:${from}`, '-c', 'copy', '-f', 'webm', '-y', `file:${to}`],
    { stdio: ['ignore', 'inherit', 'inherit'] },
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg could not remux the recording (exit ${String(result.status)})`);
  }
}

/** ffmpeg on the PATH, or the one Playwright installed for its own recording. */
function findFfmpeg() {
  const onPath = spawnSync('which', ['ffmpeg'], { encoding: 'utf8' });
  if (onPath.status === 0) return onPath.stdout.trim();

  const cache = path.join(homedir(), 'Library', 'Caches', 'ms-playwright');
  const linuxCache = path.join(homedir(), '.cache', 'ms-playwright');
  for (const root of [cache, linuxCache]) {
    if (!existsSync(root)) continue;
    for (const entry of readdirSync(root)) {
      if (!entry.startsWith('ffmpeg')) continue;
      for (const name of ['ffmpeg-mac', 'ffmpeg-linux', 'ffmpeg-win64.exe']) {
        const candidate = path.join(root, entry, name);
        if (existsSync(candidate)) return candidate;
      }
    }
  }
  throw new Error('No ffmpeg found: install one, or run `npx playwright install ffmpeg`.');
}
