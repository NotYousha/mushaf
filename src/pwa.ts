import { registerSW } from 'virtual:pwa-register'

/**
 * Keep the installed app on the current build.
 *
 * A service worker will happily serve a cached app for as long as nothing
 * tells it otherwise, and an installed PWA is rarely "reloaded" the way a tab
 * is — so a fix can ship, deploy, and never reach the person who asked for it.
 * That is not a hypothetical: three separate fixes were reported as not
 * working while the device was still running the build from before them.
 *
 * So: take the update as soon as it exists, and check again whenever the app
 * comes back to the foreground, which for a home-screen app is the only moment
 * that reliably happens.
 */
export function keepFresh() {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return

  /**
   * Register the worker ourselves, bypassing the HTTP cache for the script.
   *
   * This is the bug that keeps a stale app stuck. A service worker script is
   * fetched through the ordinary HTTP cache unless updateViaCache says
   * otherwise, and GitHub Pages serves it with a cache header — so a browser
   * can go on using yesterday's worker, and therefore yesterday's app, without
   * ever discovering that a new one exists. `none` makes every update check
   * ask the network.
   */
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker
      .register(`${import.meta.env.BASE_URL}sw.js`, {
        scope: import.meta.env.BASE_URL,
        updateViaCache: 'none',
      })
      .catch(() => {
        /* registerSW below is the fallback */
      })
  }

  const update = registerSW({
    immediate: true,
    onNeedRefresh() {
      // autoUpdate already claims the page; reloading is what makes the new
      // assets actually be the ones running.
      window.location.reload()
    },
    onRegisteredSW(_url, registration) {
      if (!registration) return
      const check = () => {
        if (document.visibilityState === 'visible') void registration.update()
      }
      document.addEventListener('visibilitychange', check)
      window.addEventListener('focus', check)
      // Once an hour covers an app left open all evening during Ramadan.
      setInterval(check, 60 * 60 * 1000)
    },
  })

  return update
}

/** Stamped in at build time; shown in Settings. */
export const BUILD: string =
  typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'
