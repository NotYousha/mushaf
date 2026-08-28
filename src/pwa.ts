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
/**
 * Whether now is a bad moment to reload, as the app sees it.
 *
 * Set by the app to "audio is playing or a download is running". Absent, an
 * update reloads at once, which is right for a cold tab and wrong for anything
 * else.
 */
let busy: (() => boolean) | null = null

/**
 * Tell the updater when it must wait.
 *
 * `onNeedRefresh` used to call `window.location.reload()` outright. On a desk
 * that is invisible; on a phone it stops the recitation and empties the
 * player, and because the app checks for updates every time it comes back to
 * the foreground, the likeliest moment to be reloaded was the moment someone
 * picked the phone up to see how far through the surah they were. A download
 * in flight was cut the same way, though chunked resume made that recoverable.
 *
 * Deferring is not free — the new worker has already claimed the page, so a
 * chunk lazy-loaded after this point could be gone from both the cache and the
 * server. That is a rare tab-left-open case and it fails loudly. Cutting the
 * audio is neither rare nor loud, so it loses.
 */
export function holdUpdatesWhile(fn: () => boolean) {
  busy = fn
}

/**
 * The waiting worker, and the call that lets it take the page.
 *
 * Assigned by `keepFresh`. `registerSW` returns a function that posts
 * SKIP_WAITING to the worker parked in `waiting` and reloads once it has taken
 * control; a bare `window.location.reload()` would only re-serve the build
 * that is already installed, which is the failure this whole module exists to
 * prevent.
 */
let takeUpdate: ((reload?: boolean) => Promise<void>) | null = null

/** Hand the page over at the first moment nothing is playing or downloading. */
function reloadWhenIdle() {
  const go = () => {
    if (busy?.()) return false
    if (takeUpdate) void takeUpdate(true)
    else window.location.reload()
    return true
  }
  if (go()) return
  // Cheap, and the only two things that end a busy period are a track ending
  // and a queue draining — neither of which this module can observe directly.
  const timer = setInterval(() => {
    if (go()) clearInterval(timer)
  }, 5000)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void go()
  })
}

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
      // A new build is installed and waiting. Let it have the page at the
      // first moment that costs nobody a recitation. See holdUpdatesWhile.
      reloadWhenIdle()
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

  takeUpdate = update
  return update
}

/** Stamped in at build time; shown in Settings. */
export const BUILD: string =
  typeof __BUILD__ === 'string' ? __BUILD__ : 'dev'
