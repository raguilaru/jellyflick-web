import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  test: {
    environment: 'happy-dom',
    include: ['test/unit/**/*.test.ts', 'test/unit/**/*.test.tsx'],
    setupFiles: ['./test/setup.ts'],
    globalSetup: ['./test/fake-jellyfin/global-setup.ts'],
    // One fake Jellyfin serves the whole run and holds mutable sample data, so
    // test files run one at a time. Keep it this way, or seeding one file's
    // state will change what another file sees.
    fileParallelism: false,
  },
});
