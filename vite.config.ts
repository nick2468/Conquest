import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [
    react(),

    // What turns the page into something you add to the Home Screen. It
    // writes the manifest and a service worker that stores the whole game,
    // so it opens with no internet at all. See the design brief.
    VitePWA({
      // 'prompt', NOT 'autoUpdate'. An automatic update reloads the page the
      // moment a new version arrives, and a game part way through is only
      // held in memory. See spec section 14: saving a game is not built yet.
      // Waiting means a new version starts the next time the app is opened
      // fresh, which cannot lose anybody's game.
      registerType: 'prompt',
      // The app registers the worker itself, through useRegisterSW, so it
      // can show a bar when a new version is waiting. 'auto' would register
      // it behind our back and the app would never hear about the update.
      injectRegister: null,
      includeAssets: ['apple-touch-icon.png', 'favicon-32.png', 'icon.svg'],

      manifest: {
        name: 'Conquest',
        short_name: 'Conquest',
        description: 'A turn-based territory game set in Australia.',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#f6f4ef',
        theme_color: '#1f3348',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },

      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,webmanifest}'],
      },

      // No service worker while developing. A cached old build during
      // development wastes hours and teaches nothing.
      devOptions: { enabled: false },
    }),
  ],

  build: {
    rollupOptions: {
      // Three pages: the game, the map editor, and the map on its own. The editor ships
      // with the game rather than living somewhere else, so it works with
      // no internet and is one link away. See plan task 5.9.
      input: {
        game: 'index.html',
        editor: 'editor.html',
        map: 'map.html',
      },
    },
  },

  server: {
    // 5173 belongs to dc.web on this machine. Conquest uses 5180.
    // strictPort makes a clash fail loudly instead of quietly moving to
    // another port, which would leave two servers looking identical.
    port: 5180,
    strictPort: true,
  },

  test: {
    // The engine needs no browser, so tests run straight on Node and stay fast.
    // Phase 2 adds a second setting for the screen tests.
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
