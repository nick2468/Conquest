import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [react()],

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
