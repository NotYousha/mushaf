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
        // Fonts are precached now that they are ours: the mushaf must render
        // correctly offline, not fall back to a system face.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}'],
        // The mushaf layout and the word timings are lazy chunks worth about
        // 3 MB. Precaching them would pull the whole lot down at install,
        // which is exactly what lazy-loading them was meant to avoid. They are
        // fetched when the Mushaf tab is first opened and cached at runtime.
        globIgnores: ['**/mushaf-layout-*.js', '**/timings-*.js', '**/forks-*.js'],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/(mushaf-layout|timings)-[\w-]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mushaf-data',
              expiration: { maxEntries: 8 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
        ],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        // Without these, a new build sits behind the old service worker and
        // only takes effect on some later visit — which is exactly how an
        // update can appear not to have shipped at all.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,

      },
    }),
  ],
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    globals: true,
  },
})
