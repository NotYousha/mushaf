/// <reference types="vitest" />
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
         * Pinned, rather than left to default to start_url.
         *
         * The identity of an installed app is its id, and letting it fall out
         * of start_url means that moving the app to a domain root — which is
         * what a Play listing needs, so that Digital Asset Links can be served
         * from the origin — would present as a different app to anything that
         * had already installed this one.
         */
        id: base,
        start_url: base,
        scope: base,
        display: 'standalone',
        // minimal-ui, never 'browser': a fall back to a tab would put an
        // address bar over an app that is meant to be a mushaf.
        display_override: ['standalone', 'minimal-ui'],
        /*
         * Arabic, stated.
         *
         * vite-plugin-pwa fills in lang: 'en' when this is absent, and the
         * built manifest then disagreed with <html lang="ar" dir="rtl"> and
         * with DEFAULT_LANG. Bubblewrap reads the manifest, not the document,
         * so the Android build would have inherited the wrong default.
         */
        lang: 'ar',
        dir: 'rtl',
        description:
          'مصحف مرتل: تلاوات كاملة بأصوات قرّاء الحرمين وغيرهم، مع المصحف المطبوع، تعمل دون اتصال. — A murattal mushaf: complete recitations, the printed page, and offline listening.',
        categories: ['education', 'lifestyle'],
        // The printed mushaf is 604 portrait pages; landscape has nothing to
        // offer it. Bubblewrap writes this into the activity.
        orientation: 'portrait',
        background_color: '#f6f0e6',
        /*
         * The cream, and it does not follow the theme picker.
         *
         * theming.ts re-stamps <meta name="theme-color"> at runtime, which the
         * browser honours. An installed Android app reads theme_color from the
         * manifest once, at install, for its system bars — so a reader who
         * chooses Kiswah gets black cards under a cream status bar. Fixing that
         * needs the native side, not this file.
         */
        theme_color: '#f6f0e6',
        icons: [
          // 'any' stated rather than implied: an unlabelled icon is treated as
          // 'any' by browsers, but Bubblewrap reads this list to decide what to
          // put where and should not have to guess.
          {
            src: `${base}mark-192.png`,
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any',
          },
          {
            src: `${base}mark-512.png`,
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any',
          },
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
        // A pattern with no leading globstar matches the root of dist and
        // nothing below it, so '*.{webp,jpg}' precaches the portraits while
        // leaving the 604 Ad-Duri pages under /duri/ alone. That distinction is
        // the whole reason the comment further down says webp cannot go in this
        // list: written with a globstar it would pull 79 MB into the install.
        //
        // Precached rather than left to the runtime cache because a portrait
        // nobody has looked at was never fetched — every face is a CSS
        // background image, so nothing requests it until its grid paints. A
        // reader who had only opened the home screen and then went offline
        // found six faces and fifteen empty rings on 'See all', which reads as
        // a broken app rather than as a cache miss.
        globPatterns: ['**/*.{js,css,html,png,svg,woff2}', '*.{webp,jpg}'],
        // The mushaf layout and the word timings are lazy chunks worth about
        // 3 MB. Precaching them would pull the whole lot down at install,
        // which is exactly what lazy-loading them was meant to avoid. They are
        // fetched when the Mushaf tab is first opened and cached at runtime.
        globIgnores: [
          '**/mushaf-layout-*.js',
          // The alternate editions' layouts, for the same reason: 2.6 MB
          // each, and a reader opens one. Precaching them would put the
          // IndoPak mushaf on the phone of somebody reading the Madani.
          '**/layout-*.js',
          '**/timings-*.js',
          '**/forks-*.js',
          // Installer artwork. The OS fetches these when the app is added to
          // a home screen; the running app never asks for them, so precaching
          // costs a quarter of a megabyte for nothing.
          // These were named icon-*.png until the wordmark replaced the girih
          // star, so the exclusion had quietly stopped matching anything and
          // the four mark-* files were being precached after all.
          '**/mark-*.png',
        ],
        runtimeCaching: [
          {
            urlPattern: /\/assets\/(mushaf-layout|layout|timings|forks)-[\w-]+\.js$/,
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
              /*
               * 120, against 34 root-level images today.
               *
               * The ceiling only grows — four reciters were added in a single
               * commit recently — and when it crosses the limit the symptom is
               * portraits vanishing offline in least-recently-used order, on
               * devices nobody can inspect, with no error raised anywhere.
               */
              expiration: { maxEntries: 120, maxAgeSeconds: 60 * 60 * 24 * 365 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            /**
             * The translations.
             *
             * Six files, five and a half megabytes between them, and a reader
             * needs one. Precaching all of them would put the Urdu, Hindi,
             * French and the Arabic tafsir on the phone of someone who reads
             * English — so they are fetched on first use and kept, which
             * makes the one you actually read work offline at the cost of the
             * one you actually read.
             *
             * The tajweed rules ride the same rule: 1.3 MB, and only the
             * reader who chooses the tajweed mushaf ever asks for it.
             */
            urlPattern: /\/(trans\/[\w-]+|tajweed)\.json$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'translations',
              expiration: { maxEntries: 12, maxAgeSeconds: 60 * 60 * 24 * 365 },
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
    /*
     * A git worktree checked out under .claude/ is a second, complete copy of
     * this repo, tests and all -- so vitest's default glob found every suite
     * twice and reported eighty files where there are forty. Worse, the copy
     * fails or passes on its own branch's code, which makes a run of this one
     * unreadable.
     */
    exclude: ['**/node_modules/**', '**/dist/**', '**/.claude/**'],
  },
})
