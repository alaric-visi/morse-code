import { defineConfig } from 'vitest/config';
import preact from '@preact/preset-vite';
import type { Plugin } from 'vite';

/** Lists every built file (not source maps) for the service worker to precache. */
function precacheList(): Plugin {
  return {
    name: 'mc-precache',
    apply: 'build',
    generateBundle(_, bundle) {
      // Fonts: only the WOFF2 Latin subsets the UK English interface uses; others load on demand.
      const files = Object.keys(bundle).filter(
        (f) => !f.endsWith('.map') && f !== 'index.html' && !f.endsWith('.woff') && (!f.endsWith('.woff2') || /-latin-(ext-)?(\d+|wght)/.test(f)),
      );
      const version = Date.now().toString(36);
      this.emitFile({ type: 'asset', fileName: 'precache.json', source: JSON.stringify({ version, files }) });
    },
  };
}

/**
 * `base` defaults to './' so the built app works from any sub-path (for example
 * /morse/ on the Astro site). Set MC_BASE to pin an absolute base instead.
 */
export default defineConfig({
  base: process.env.MC_BASE ?? './',
  plugins: [preact(), precacheList()],
  build: { target: 'es2022', sourcemap: true },
  test: { environment: 'node', include: ['tests/**/*.test.ts'] },
});
