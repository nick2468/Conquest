import { defineConfig } from 'vite'

/**
 * Build the engine as plain JavaScript, for the tuner. Plan task 4.42.
 *
 * The tuner plays hundreds of thousands of games in Node worker threads,
 * one per processor core. A worker cannot read TypeScript, so the engine is
 * built once into `tools/dist/engine.js` and every worker imports that.
 *
 * Nothing the game ships uses this build. It is a tool, and `tools/dist` is
 * not committed.
 */
export default defineConfig({
  build: {
    lib: {
      entry: 'tools/tune-entry.ts',
      formats: ['es'],
      fileName: 'engine',
    },
    outDir: 'tools/dist',
    emptyOutDir: true,
    minify: false,
    target: 'node20',
  },
})
