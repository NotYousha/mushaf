/// <reference types="vitest" />
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// GitHub Pages serves a project site from /<repo>/, so every asset URL needs
// that prefix. Overridable for local dev and other hosts.
const base = process.env.BASE_PATH ?? '/mushaf/'

/**
 * A visible build stamp.
 *
 * An installed PWA can go on serving a cached app for days, which makes "it
 * still does the old thing" impossible to tell apart from "the fix did not
 * work". Settings shows this, so the question can be settled in one glance.
 */
const BUILD = JSON.stringify(
  `${new Date().toISOString().slice(0, 16).replace('T', ' ')} ${(process.env.GITHUB_SHA ?? 'local').slice(0, 7)}`,
)

export default defineConfig({
  base,
  define: { __BUILD__: BUILD },
  /*
   * Two documents rather than one.
   *
   * GitHub Pages serves static files and has no routing, so a landing page and
   * an app have to be two real files -- a client-side route would need a 404
   * fallback and would ship the whole bundle just to decide which of two
   * things to show.
   *
   * The landing page deliberately imports no React. Its job is to load fast
   * and show the word-sync moving, and a framework standing between a visitor
   * and the one thing worth showing them serves nobody.
   */
  build: {
    rollupOptions: {
      input: {
        /*
         * At the root, not in landing/, because Vite mirrors an input's source
         * path into dist -- from landing/index.html the front door would have
         * been served at /mushaf/landing/ rather than at /mushaf/.
         */
        landing: resolve(__dirname, 'index.html'),
        app: resolve(__dirname, 'app/index.html'),
      },
    },
  },
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      // Registered by src/pwa.ts instead, so the app can force a check and
      // reload rather than waiting for the browser to notice on its own.
      injectRegister: false,
      manifest: {
        name: "Al-Mau'iza — الموعظة",
        short_name: "Al-Mau'iza",
        /*
         * The app now lives a level down, so this points there.
         *
         * Scope stays at the base and must: /mushaf/ still covers /mushaf/app/,
         * which is what keeps every already-installed app working. Narrowing it
         * to match start_url would revoke the scope of every installation made
         * before this change.
         *
         * There is still a window where an installed client holds the old
         * start_url and opens the landing page instead of the app. That is what
         * the redirect in landing/landing.ts is for -- see src/landing/enter.ts.
         */
        start_url: `${base}app/`,
        scope: base,
        display: 'standalone',
        background_color: '#f6f0e6',
        theme_color: '#f6f0e6',
        icons: [
          { src: `${base}mark-192.png`, sizes: '192x192', type: 'image/png' },
          { src: `${base}mark-512.png`, sizes: '512x512', type: 'image/png' },
          {
            // The name set narrower here, so it survives Android's circle crop.
            // See scripts/make-app-icons.py for the arithmetic.
            src: `${base}mark-maskable-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
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
        globIgnores: [
          '**/mushaf-layout-*.js',
          '**/timings-*.js',
          '**/forks-*.js',
          // Installer artwork. The OS fetches these when the app is added to
          // a home screen; the running app never asks for them, so precaching
          // costs a quarter of a megabyte for nothing.
          '**/icon-512.png',
          '**/icon-maskable-512.png',
        ],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/(mushaf-layout|timings|forks)-[\w-]+\.js$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'mushaf-data',
              expiration: { maxEntries: 8 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            /**
             * The reciters' portraits.
             *
             * They cannot go in globPatterns: adding webp there would sweep in
             * the 604 printed mushaf pages below, which are 79 MB. Matched here
             * instead — root-level images only, never the /duri/ pages — so a
             * face that has been seen once survives going offline, which for an
             * app built around offline listening it ought to.
             */
            urlPattern: ({ url }) =>
              /\/[^/]+\.(webp|jpg|jpeg)$/.test(url.pathname) && !url.pathname.includes('/duri/'),
            handler: 'CacheFirst',
            options: {
              cacheName: 'reciter-photos',
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // Printed pages of the Ad-Duri mushaf. All 604 weigh 79 MB, far
            // too much to precache, but a page the reader has actually opened
            // should still be there on a train with no signal. Kept to a few
            // hundred so a whole juz of reading survives offline without the
            // cache growing without bound.
            urlPattern: /\/duri\/\d{3}\.webp$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'duri-pages',
              expiration: { maxEntries: 320, maxAgeSeconds: 60 * 60 * 24 * 180 },
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
