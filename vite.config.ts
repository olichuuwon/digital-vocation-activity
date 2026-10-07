/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

/**
 * Lists every built file in precache.json, so the service worker can cache the whole game on its
 * first visit: a booth phone that loses Wi-Fi mid-run can still open screens it hasn't seen yet.
 */
function precacheList(): Plugin {
  let base = '/';
  let version = 'dev';
  return {
    name: 'ship-it-precache',
    apply: 'build',
    configResolved(c) {
      base = c.base;
    },
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      const list = [base, base + 'icon.svg', base + 'manifest.webmanifest', ...files.map((f) => base + f)];
      version = createHash('sha256').update(list.join('\n')).digest('hex').slice(0, 10);
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify(list) });
    },
    // A new build changes sw.js (its cache name), so browsers install the new worker, precache the
    // new files and drop the old cache.
    writeBundle(opts) {
      const sw = resolve(opts.dir ?? 'dist', 'sw.js');
      if (existsSync(sw)) writeFileSync(sw, readFileSync(sw, 'utf8').replace("const CACHE = 'ship-it-v2';", `const CACHE = 'ship-it-${version}';`));
    },
  };
}

// BASE_PATH lets the static host serve from a sub-path (e.g. GitHub Pages /ship-it/).
export default defineConfig({
  base: process.env.BASE_PATH ?? '/',
  plugins: [react(), precacheList()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    include: ['src/**/*.test.{ts,tsx}', 'supabase/**/*.test.ts'],
  },
});
