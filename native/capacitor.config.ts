import type { CapacitorConfig } from '@capacitor/cli'

/**
 * NEVER COMPILED. Written on Windows, where no Xcode exists.
 *
 * webDir is dist, and the app now lives at dist/app — so the shell loads
 * app/index.html rather than the landing page. Shipping the marketing page
 * inside the app would be absurd, and it is the default a wrapper picks.
 */
const config: CapacitorConfig = {
  appId: 'com.mushaf.almauiza',
  appName: "Al-Mau'iza",
  webDir: 'dist',
  ios: {
    // The landing page redirects an installed client through to the app, but
    // inside a wrapper there is no reason to load it and pay the redirect.
    path: 'ios',
  },
  server: {
    iosScheme: 'capacitor',
  },
}

export default config
