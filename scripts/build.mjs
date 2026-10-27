/**
 * `vite build`, plus the one guard the build itself does not give us.
 *
 * Oxc cannot downlevel top-level `await` for `chrome68`. It prints
 * `[TOLERATED_TRANSFORM]`, leaves the `await` in the output and then exits 0 —
 * so a clean build can still ship code the target cannot parse. ESLint bans
 * top-level `await` in our own code; this catches it arriving from a dependency.
 */
import { spawn } from 'node:child_process';

const MARKER = 'TOLERATED_TRANSFORM';

const child = spawn('npx', ['vite', 'build', ...process.argv.slice(2)], {
  stdio: ['inherit', 'pipe', 'pipe'],
});

let tolerated = false;

for (const [stream, out] of [
  [child.stdout, process.stdout],
  [child.stderr, process.stderr],
]) {
  stream.on('data', (chunk) => {
    const text = String(chunk);
    if (text.includes(MARKER)) tolerated = true;
    out.write(text);
  });
}

child.on('exit', (code) => {
  if (code !== 0) process.exit(code ?? 1);
  if (tolerated) {
    process.stderr.write(
      `\nbuild refused: the bundler reported ${MARKER}, so the output contains syntax Chromium 68 cannot parse.\n`,
    );
    process.exit(1);
  }
});
