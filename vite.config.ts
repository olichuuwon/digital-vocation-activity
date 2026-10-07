/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';

/**
 * Lists every built file in precache.json, so the service worker can cache the whole game on its
 * first visit: a booth phone that loses Wi-Fi mid-run can still open screens it hasn't seen yet.
 */
function precacheList(): Plugin {
  let base = '/';
  return {
    name: 'ship-it-precache',
    apply: 'build',
    configResolved(c) {
      base = c.base;
    },
    generateBundle(_, bundle) {
      const files = Object.keys(bundle).filter((f) => !f.endsWith('.map'));
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify([base, base + 'icon.svg', base + 'manifest.webmanifest', ...files.map((f) => base + f)]) });
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
