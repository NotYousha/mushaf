/*
 * Stamps the saved theme before the first paint.
 *
 * The real preference lives in IndexedDB with everything else, but that is
 * asynchronous: by the time React can read it the page has already painted,
 * so a black theme opens with a flash of cream on every single launch. The
 * choice is therefore mirrored into localStorage purely so it can be read
 * synchronously here, in the document head, before anything is drawn.
 *
 * A separate file rather than an inline script because the page's
 * Content-Security-Policy allows neither inline script nor eval.
 */
(function () {
  try {
    var theme = localStorage.getItem('mushaf:theme') || 'mushaf'
    var mode = localStorage.getItem('mushaf:mode') || 'system'
    if (mode === 'system') {
      mode = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
    }
    var root = document.documentElement
    root.setAttribute('data-theme', theme)
    root.setAttribute('data-mode', mode)
  } catch (e) {
    /* A private window can throw on localStorage; the default palette is
       already correct, so there is nothing to recover from. */
  }
})()
