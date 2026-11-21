import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

/**
 * The embeddable library: `dist-lib/morse-code.js` (an ES module exporting
 * `mount` and `MorseCode`) and `dist-lib/morse-code.css`, with fonts and the lazy
 * screens as separate files beside them. Preact is bundled in, so a host page
 * needs nothing else. Built as an app with the embed file as its entry (not
 * library mode, which would inline every font into the CSS).
 */
export default defineConfig({
  base: './',
  publicDir: false,
  plugins: [preact()],
  build: {
    outDir: 'dist-lib',
    target: 'es2022',
    sourcemap: true,
    cssCodeSplit: false,
    rollupOptions: {
      input: 'src/embed.ts',
      preserveEntrySignatures: 'exports-only',
      output: {
        entryFileNames: 'morse-code.js',
        chunkFileNames: 'chunks/[name]-[hash].js',
        assetFileNames: (a) => (a.names?.[0]?.endsWith('.css') ? 'morse-code.css' : 'assets/[name]-[hash][extname]'),
      },
    },
  },
});
