import { shouldEnterApp, APP_PATH, USED_KEY } from '../src/landing/enter'

/**
 * Send an installed app, or a returning reader, straight to the app.
 *
 * Runs before the page has anything to show, so there is nothing to flash.
 * `replace` rather than `assign`, so Back goes wherever the reader came from
 * instead of bouncing them through the redirect again.
 */
function enter(): boolean {
  let standalone = false
  try {
    standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      // iOS shipped this property years before it shipped the media query, and
      // an iPhone home-screen app is the single most likely installed client.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch {
    /* No matchMedia. Treated as a browser, which shows the page — the safe
       direction to be wrong in, since the page has a link to the app. */
  }

  let hasUsedApp = false
  try {
    hasUsedApp = localStorage.getItem(USED_KEY) === '1'
  } catch {
    /* Site data blocked. The reader sees the page; the link still works. */
  }

  if (shouldEnterApp({ standalone, hasUsedApp })) {
    location.replace(new URL(APP_PATH, location.href).href)
    return true
  }
  return false
}

/**
 * The word-sync demo.
 *
 * Built from the app's own layout and timing data by scripts/build-landing.mjs,
 * played against the recording that ships in public/audio — because the claim
 * being made is that this works, and a hand-animated approximation would be a
 * claim about a mock-up.
 *
 * Silent until asked. Autoplaying recitation at someone who opened a web page
 * is not acceptable, and browsers block it anyway.
 */
function startDemo(): void {
  const page = document.querySelector<HTMLElement>('[data-demo-page]')
  const figure = document.querySelector<HTMLElement>('[data-demo-from]')
  const button = document.querySelector<HTMLButtonElement>('[data-demo-play]')
  if (!page || !button || !figure) return

  const words = [...page.querySelectorAll<HTMLElement>('[data-t]')]
  if (words.length === 0) return

  const from = Number(figure.dataset.demoFrom ?? 0)
  const to = Number(figure.dataset.demoTo ?? 0)

  const audio = new Audio(`${import.meta.env.BASE_URL}audio/burhaji-097.mp3`)
  audio.preload = 'none'

  let raf = 0

  const paint = (t: number) => {
    for (const w of words) {
      const start = Number(w.dataset.t)
      const end = Number(w.dataset.tEnd)
      w.classList.toggle('is-now', t >= start && t < end)
    }
  }

  const clear = () => {
    for (const w of words) w.classList.remove('is-now')
  }

  const stop = () => {
    audio.pause()
    cancelAnimationFrame(raf)
    button.dataset.state = 'paused'
    clear()
  }

  const tick = () => {
    // The file is the whole surah; the demo is one ayah of it. Stopping at the
    // end of the ayah rather than letting it run on is what keeps this a
    // demonstration instead of a player nobody asked for.
    if (to && audio.currentTime >= to) return stop()
    paint(audio.currentTime)
    raf = requestAnimationFrame(tick)
  }

  button.addEventListener('click', () => {
    if (audio.paused) {
      // Seek every time, so a second press restarts the line rather than
      // resuming wherever the surah had got to.
      audio.currentTime = from
      void audio.play().catch(() => {
        // Autoplay policy, a missing file, or an offline first visit. The
        // silent walk below has already shown what the claim means, so failing
        // quietly is better than an alert about a demo.
        stop()
      })
      raf = requestAnimationFrame(tick)
      button.dataset.state = 'playing'
    } else {
      stop()
    }
  })

  audio.addEventListener('ended', stop)

  /*
   * Someone who scrolls past without pressing anything should still see what
   * the claim means, so the highlight walks the line once, silently, the first
   * time the page is looked at.
   */
  const io = new IntersectionObserver(
    (entries) => {
      if (!entries.some((e) => e.isIntersecting)) return
      io.disconnect()
      if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
      let i = 0
      const walk = window.setInterval(() => {
        words.forEach((w, n) => w.classList.toggle('is-now', n === i))
        if (++i >= words.length) {
          window.clearInterval(walk)
          window.setTimeout(clear, 420)
        }
      }, 420)
    },
    { threshold: 0.5 },
  )
  io.observe(page)
}

if (!enter()) startDemo()
