/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves a project site from /<repo>/, so every asset URL needs
// that prefix. Overridable for local dev and other hosts.
const base = process.env.BASE_PATH ?? '/mushaf/'

export default defineConfig({
  base,
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Mushaf — ياسر الدوسري',
        short_name: 'Mushaf',
        start_url: base,
        scope: base,
        display: 'standalone',
        background_color: '#f6f0e6',
        theme_color: '#f6f0e6',
        icons: [{ src: `${base}icon-512.png`, sizes: '512x512', type: 'image/png' }],
      },
      workbox: {
        // App shell only. Audio lives in IndexedDB and must never enter the SW cache.
        globPatterns: ['**/*.{js,css,html,png,svg}'],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
})
