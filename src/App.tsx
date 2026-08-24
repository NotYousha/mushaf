import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadCatalog, buildView, surahMeta } from './catalog/load'
import type { Reciter, SurahView } from './catalog/types'
import {
  effectiveVerified,
  getVerdicts,
  setVerdict,
  type Verdict,
} from './catalog/verification'
import {
  listDownloaded,
  putAudio,
  deleteAudio,
  purgeSuspectAudio,
} from './db/audio'
import { loadPosition, getPref, setPref } from './db/prefs'
import { addPeek, addStumble } from './db/practice'
import { DownloadQueue } from './download/queue'
import { CatalogSource } from './sources/CatalogSource'
import { PlayerEngine, type PlaybackMode } from './player/engine'
import {
  clearMetadata,
  setNavAvailability,
  updateMetadata,
  type MediaHandlers,
} from './player/mediaSession'
import { nextSurah, prevSurah, type RepeatMode } from './player/playQueue'
import { getQuota, requestPersistence, canDownloadAll } from './storage/quota'
import { SurahList, plainName } from './ui/SurahList'
import { VerifyPanel } from './ui/VerifyPanel'
import { MushafView, ayahStartsFor } from './ui/MushafView'
import { HifzBoard } from './ui/HifzBoard'
import { ForkDrill } from './ui/ForkDrill'
import { PagedMushaf } from './ui/PagedMushaf'
import { Talqeen, type TalqeenState } from './player/talqeen'
import {
  hasTimings,
  lineSegments,
  loadLayout,
  loadTimings,
  pageForKey,
} from './mushaf/data'
import { ImportPanel } from './ui/ImportPanel'
import { formatBytes, formatTime } from './ui/format'
import {
  Shuffle,
  Repeat,
  RepeatOne,
  Search,
  Play,
  Pause,
  Back,
  Forward,
  Moon,
  Star,
  Cast,
  Library,
  QuranMark,
  More,
  Heart,
  Broadcast,
  Talqeen as TalqeenIcon,
  Stumble,
  Chevron,
} from './ui/Icons'
import { stringsFor, type Lang } from './i18n'
import { brandName, brandSecondary } from './brand'
import { LangPicker } from './ui/LangPicker'
import { ThemePicker } from './ui/ThemePicker'
import { Dock, type DockTab } from './ui/Dock'
import {
  applyNativeInsets,
  isNativeShell,
  publishNowPlaying,
  publishTab,
} from './native/shell'
import {
  applyTheme,
  DEFAULT_THEME,
  watchSystemMode,
  type Mode,
  type ThemeId,
} from './ui/theming'
import { isHafs, riwayahLabel } from './catalog/riwayah'
import { artistFor, artistForEn, voiceLabel } from './catalog/voice'
import { Splash } from './ui/Splash'
import './ui/theme.css'
import './ui/themes.css'
import './ui/glass.css'
import './ui/motion.css'
import './ui/desktop.css'

type Tab = 'quran' | 'library' | 'text' | 'hifz' | 'more'
const SPEEDS = [1, 1.25, 1.5, 0.75]

const dlKey = (reciterId: string, surah: number) => `${reciterId}:${surah}`

export default function App() {
  const [reciters, setReciters] = useState<Reciter[]>([])
  const [reciterId, setReciterId] = useState('dosari')
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set())
  /** Interrupted downloads, keyed the same way, with the bytes still owed. */
  const [partials, setPartials] = useState<Map<string, { done: number; total: number }>>(
    new Map(),
  )
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [verdicts, setVerdicts] = useState<Record<string, Verdict>>({})
  const [favourites, setFavourites] = useState<string[]>([])
  const [current, setCurrent] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [mode, setMode] = useState<PlaybackMode>('streaming')
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [repeat, setRepeat] = useState<RepeatMode>('off')
  const [shuffle, setShuffle] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(0)
  const [sleepAt, setSleepAt] = useState<number | null>(null)
  const [tab, setTab] = useState<Tab>('quran')
  const [query, setQuery] = useState('')
  const [quota, setQuota] = useState({ usage: 0, quota: 0, free: 0 })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [lang, setLang] = useState<Lang>('ar')
  const t = stringsFor(lang)
  const [confirmAll, setConfirmAll] = useState(false)
  const [queued, setQueued] = useState(0)
  const [canCast, setCanCast] = useState(false)
  const [persisted, setPersisted] = useState<boolean | null>(null)
  const [talqeen, setTalqeen] = useState(false)
  const [drill, setDrill] = useState<TalqeenState | null>(null)
  /** The player folded down to a strip, so the list has the screen. */
  /** The full player is a sheet over the app; the dock capsule is its
   *  collapsed form, so it starts closed. */
  const [playerMin, setPlayerMin] = useState(true)
  const [theme, setTheme] = useState<ThemeId>(DEFAULT_THEME)
  const [appearance, setAppearance] = useState<Mode>('system')

  const engine = useRef<PlayerEngine | null>(null)
  if (!engine.current) engine.current = new PlayerEngine()

  const reciter = useMemo(
    () => reciters.find((r) => r.id === reciterId) ?? reciters[0] ?? null,
    [reciters, reciterId],
  )

  const surahs = useMemo(() => (reciter ? buildView(reciter, surahMeta) : []), [reciter])

  const urls = useMemo(
    () => new Map(surahs.filter((s) => s.url).map((s) => [s.surah, s.url as string])),
    [surahs],
  )

  // Each job carries its own reciter and URL, so switching reciter while a
  // download is queued can no longer fetch or file the wrong audio.
  const queue = useRef<DownloadQueue | null>(null)
  if (!queue.current) {
    queue.current = new DownloadQueue({
      fetcher: (job, onProgress, signal) =>
        new CatalogSource(job.reciterId, new Map([[job.surah, job.url]])).fetchSurah(
          job.surah,
          onProgress,
          signal,
        ),
      // The download persists its own chunks as they arrive, so there is
      // nothing left to save. Writing the assembled blob again here would
      // store every surah twice and rebuild a 200 MB buffer to do it.
      save: async () => {},
    })
  }

  const refreshDownloaded = useCallback(async () => {
    const list = await listDownloaded()
    // A partial download has no playable audio behind it, so counting it as
    // saved would hide a surah that cannot play and drop it from
    // "download all" — leaving it stuck part-finished forever.
    setDownloaded(
      new Set(list.filter((l) => !l.partial).map((l) => dlKey(l.reciterId, l.surah))),
    )
    setPartials(
      new Map(
        list
          .filter((l) => l.partial)
          .map((l) => [
            dlKey(l.reciterId, l.surah),
            { done: l.bytes, total: l.totalBytes ?? 0 },
          ]),
      ),
    )
    setQuota(await getQuota())
  }, [])

  useEffect(() => {
    engine.current!.onError = (m) => setError(m)
    void (async () => {
      const rs = await loadCatalog()
      setReciters(rs)
      const savedId = await getPref<string>('reciterId', rs[0]?.id ?? 'dosari')
      setReciterId(rs.some((r) => r.id === savedId) ? savedId : (rs[0]?.id ?? 'dosari'))
      setVerdicts(await getVerdicts())
      setFavourites(await getPref<string[]>('favourites', []))
      setLang(await getPref<Lang>('lang', 'ar'))
      setPlayerMin(await getPref<boolean>('playerMin', true))
      setTheme(await getPref<ThemeId>('theme', DEFAULT_THEME))
      setAppearance(await getPref<Mode>('appearance', 'system'))

      // Runs once: clears audio a since-fixed queue bug may have filed under
      // the wrong reciter, which made the wrong surah play from a saved copy.
      if (!(await getPref('purgedSuspectAudio', false))) {
        const removed = await purgeSuspectAudio()
        await setPref('purgedSuspectAudio', true)
        if (removed) {
          setError(
            `أُزيلت ${removed} سورة محفوظة قد تكون خاطئة — يمكنك حفظها من جديد.`,
          )
        }
      }

      await refreshDownloaded()
      setPersisted(await requestPersistence())
      const pos = await loadPosition()
      if (pos && rs.some((r) => r.id === pos.reciterId)) {
        setReciterId(pos.reciterId)
        setCurrent(pos.surah)
      }
    })()
  }, [refreshDownloaded])

  useEffect(() => {
    return queue.current!.subscribe((s) => {
      setProgress(s.progress)
      setQueued(s.active.length + s.pending.length)
      // Running out of room stops the whole queue, so say that plainly
      // rather than repeating one surah's error message.
      if (queue.current!.outOfSpace) setError(t.outOfSpaceStopped)
      else {
        const failed = Object.values(s.failed)[0]
        if (failed) setError(t.saveFailed(failed))
      }
      if (!s.active.length && !s.pending.length) void refreshDownloaded()
    })
  }, [refreshDownloaded, t])

  // A cast target may appear or vanish at any time, so this is a live watch
  // rather than a one-off check.
  useEffect(() => engine.current!.watchRemoteAvailability(setCanCast), [])

  useEffect(() => {
    const el = engine.current!.el
    const onTime = () => setTime(el.currentTime)
    const onMeta = () => setDuration(el.duration || 0)
    const onPlay = () => {
      setPlaying(true)
      setError(null)
    }
    const onPause = () => setPlaying(false)
    el.addEventListener('timeupdate', onTime)
    el.addEventListener('loadedmetadata', onMeta)
    el.addEventListener('durationchange', onMeta)
    el.addEventListener('play', onPlay)
    el.addEventListener('pause', onPause)
    return () => {
      el.removeEventListener('timeupdate', onTime)
      el.removeEventListener('loadedmetadata', onMeta)
      el.removeEventListener('durationchange', onMeta)
      el.removeEventListener('play', onPlay)
      el.removeEventListener('pause', onPause)
    }
  }, [])

  const downloadedHere = useMemo(
    () =>
      new Set(
        [...downloaded]
          .filter((k) => k.startsWith(`${reciterId}:`))
          .map((k) => Number(k.split(':')[1])),
      ),
    [downloaded, reciterId],
  )

  /** Surah number to the fraction already stored, for the resume label. */
  const partialsHere = useMemo(() => {
    const out = new Map<number, number>()
    for (const [k, v] of partials) {
      if (!k.startsWith(`${reciterId}:`) || !v.total) continue
      out.set(Number(k.split(':')[1]), v.done / v.total)
    }
    return out
  }, [partials, reciterId])

  // Surahs the listener has marked as playing the wrong recitation. Sources
  // do ship shuffled files, and where two surahs are close in length no
  // measurement can tell — only an ear can.
  const rejected = useMemo(
    () =>
      new Set(
        Object.entries(verdicts)
          .filter(([k, v]) => v === 'wrong' && k.startsWith(`${reciterId}:`))
          .map(([k]) => Number(k.split(':')[1])),
      ),
    [verdicts, reciterId],
  )

  // An imported surah is playable even when the catalog has not published it,
  // which is the whole point of importing: it fills gaps the source has not
  // reached yet. A rejected one never is.
  const playable = useMemo(
    () =>
      surahs
        .filter((s) => (s.released || downloadedHere.has(s.surah)) && !rejected.has(s.surah))
        .map((s) => s.surah),
    [surahs, downloadedHere, rejected],
  )

  const advanceRef = useRef<(() => Promise<void>) | null>(null)

  const playSurah = useCallback(
    async (surah: number, startAt = 0) => {
      const s = surahs.find((x) => x.surah === surah)
      if (!s || !reciter) return
      if (!s.released && !downloadedHere.has(surah)) return
      if (rejected.has(surah)) return
      setBusy(true)
      setError(null)
      setCurrent(surah)

      const res = await engine.current!.load(
        reciter.id,
        surah,
        s.url,
        s.fallbackUrl,
        startAt,
      )
      setBusy(false)
      if (!res.ok) {
        setError(`${plainName(s.name)}: ${res.reason}`)
        return
      }
      setMode(res.mode)
      engine.current!.setRate(SPEEDS[speedIdx])
      await engine.current!.play()

      // The imam, not the collection: "Taraweeh 1447" on a lock screen or a
      // head unit says nothing about the voice being heard.
      updateMetadata(s, artistFor(s, reciter), import.meta.env.BASE_URL)
      setNavAvailability(prevSurah(surah, playable) !== null, nextSurah(surah, repeat, playable) !== null)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [surahs, playable, speedIdx, reciter, downloadedHere, rejected],
  )

  const advance = useCallback(async () => {
    if (current === null) return
    if (shuffle && playable.length) {
      const pool = playable.filter((n) => n !== current)
      const pick = pool[Math.floor(Math.random() * pool.length)]
      if (pick) await playSurah(pick)
      return
    }
    const n = nextSurah(current, repeat, playable)
    if (n !== null) await playSurah(n)
  }, [current, repeat, shuffle, playable, playSurah])

  useEffect(() => {
    advanceRef.current = advance
  }, [advance])

  // The handlers are registered once at construction and read through this
  // reference, so the lock-screen buttons can never act on a stale surah.
  useEffect(() => {
    const h: MediaHandlers = {
      play: () => void engine.current!.play(),
      pause: () => engine.current!.pause(),
      stop: () => {
        engine.current!.stop()
        clearMetadata()
      },
      next: () => void advanceRef.current?.(),
      prev: () => {
        // A driver who overshoots should get the start of this surah back,
        // not be thrown into the previous one — the podcast convention.
        if (engine.current!.el.currentTime > 3) {
          engine.current!.seek(0)
          return
        }
        if (current === null) return
        const p = prevSurah(current, playable)
        if (p) void playSurah(p)
      },
      seek: (sec) => engine.current!.seek(sec),
      step: (dir) => {
        const el = engine.current!.el
        const starts = current !== null ? ayahStartsFor(reciterId, current) : null
        if (!starts?.length) {
          // No timings loaded for this reciter: a plain skip is still useful.
          el.currentTime = Math.max(0, el.currentTime + dir * 15)
          return
        }
        const now = el.currentTime * 1000
        const target =
          dir > 0
            ? starts.find((t) => t > now + 250)
            : [...starts].reverse().find((t) => t < now - 1250)
        el.currentTime = (target ?? (dir > 0 ? now : 0)) / 1000
      },
    }
    engine.current!.handlers.current = h
  }, [current, playable, reciterId, playSurah])

  /**
   * The word being recited right now, to ayah precision.
   *
   * The page view knows the exact word, but a stumble can also be marked from
   * the player with the mushaf closed, and there the ayah is as fine as the
   * position gets — which is precise enough to find the place again.
   */
  const currentWordKey = useCallback((): string | null => {
    if (current === null) return null
    const starts = ayahStartsFor(reciterId, current)
    if (!starts?.length) return null
    const ms = time * 1000
    let ayah = 1
    for (let i = 0; i < starts.length; i++) if (starts[i] <= ms) ayah = i + 1
    return `${current}:${ayah}:1`
  }, [current, reciterId, time])

  const markStumble = useCallback(
    async (key: string, page?: number) => {
      if (current === null) return
      await addStumble({
        key,
        surah: current,
        page: page ?? (await pageForKey(key)),
        at: Date.now(),
      })
      // Recording a stumble has to cost nothing, so it confirms briefly and
      // gets out of the way rather than opening anything to dismiss.
      setError(t.stumbleMarked)
      window.setTimeout(() => setError(null), 1200)
    },
    [current, t],
  )

  /**
   * Play one stretch of a surah and resolve when it reaches the end.
   *
   * The Fork Drill needs playback that stops on a word rather than at the end
   * of a file, so it watches the clock and pauses itself. It loads the surah
   * only when that is not already what is playing, because a fork's two
   * branches are often in the same surah and reloading between them would put
   * a gap exactly where the drill needs none.
   */
  const playRange = useCallback(
    async (surah: number, from: number, to: number) => {
      const s = surahs.find((x) => x.surah === surah)
      if (!s || !reciter) return
      const el = engine.current!.el
      if (current !== surah) {
        const res = await engine.current!.load(reciter.id, surah, s.url, s.fallbackUrl, from)
        if (!res.ok) {
          setError(`${plainName(s.name)}: ${res.reason}`)
          return
        }
        setCurrent(surah)
      }
      engine.current!.seek(from)
      await engine.current!.play()
      await new Promise<void>((resolve) => {
        const check = () => {
          if (el.currentTime >= to || el.ended) {
            el.removeEventListener('timeupdate', check)
            clearInterval(id)
            engine.current!.pause()
            resolve()
          }
        }
        // timeupdate alone fires about four times a second, which can overrun
        // a cut by a syllable; the interval tightens that up.
        const id = setInterval(check, 40)
        el.addEventListener('timeupdate', check)
      })
    },
    [surahs, reciter, current],
  )

  /** Page the mushaf view should jump to, set when the board sends us there. */
  const [gotoPage, setGotoPage] = useState<number | null>(null)

  const openMushafAtPage = (page: number) => {
    setGotoPage(page)
    setTab('text')
  }

  // Stamped on <html>, so the palette reaches the page background and the
  // browser's own chrome, not just the React tree.
  useEffect(() => {
    applyTheme(theme, appearance)
  }, [theme, appearance])

  useEffect(() => {
    applyNativeInsets()
  }, [])


  useEffect(() => {
    publishTab(tab)
  }, [tab])


  useEffect(() => {
    if (appearance !== 'system') return
    return watchSystemMode(() => applyTheme(theme, appearance))
  }, [theme, appearance])

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const searchRef = useRef<HTMLInputElement | null>(null)
  const selectedChip = useRef<HTMLButtonElement | null>(null)

  useEffect(() => {
    selectedChip.current?.scrollIntoView({ inline: 'center', block: 'nearest' })
  }, [reciterId, reciters.length, tab])

  const talqeenRef = useRef<Talqeen | null>(null)

  /**
   * Talqeen Mode runs off the printed lines of the current surah, so it needs
   * the layout and this reciter's word timings. Both are lazy chunks; until
   * they arrive there is nothing to drill.
   */
  useEffect(() => {
    if (!talqeen || current === null || !duration) {
      talqeenRef.current?.stop()
      talqeenRef.current = null
      setDrill(null)
      return
    }
    let alive = true
    let started: Talqeen | null = null
    void (async () => {
      const [layout, timings] = await Promise.all([loadLayout(), loadTimings(reciterId)])
      if (!alive) return
      const el = engine.current!.el
      const segments = lineSegments(layout, timings, current, el.duration || 0)
      if (!segments.length) {
        // The reciter is timed, but not for this surah — coverage grows one
        // surah at a time. Say so and switch back off, rather than leaving a
        // mode that is on and doing nothing.
        setError(t.talqeenNeedsTimings)
        setTalqeen(false)
        return
      }
      started = new Talqeen({
        el,
        segments,
        onState: setDrill,
        onFinished: () => void advanceRef.current?.(),
      })
      talqeenRef.current = started
      started.start()
    })()
    return () => {
      alive = false
      started?.stop()
      if (talqeenRef.current === started) talqeenRef.current = null
    }
    // `advance` is read through its ref so a change of queue does not restart
    // the drill mid-line.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talqeen, current, reciterId, duration])

  useEffect(() => {
    const el = engine.current!.el
    const onEnded = () => {
      // The last line of a surah ends exactly where the audio does, so
      // Talqeen takes the ending over to give that line its turn before
      // anything moves on.
      if (talqeenRef.current?.handleEnded()) return
      void advance()
    }
    el.addEventListener('ended', onEnded)
    return () => el.removeEventListener('ended', onEnded)
  }, [advance])

  useEffect(() => {
    if (sleepAt === null) return
    const id = setTimeout(
      () => {
        engine.current!.stop()
        setSleepAt(null)
      },
      sleepAt * 60_000,
    )
    return () => clearTimeout(id)
  }, [sleepAt])

  const switchReciter = async (id: string) => {
    if (id === reciterId) return
    engine.current!.pause()
    setReciterId(id)
    setCurrent(null)
    setTime(0)
    setDuration(0)
    setError(null)
    await setPref('reciterId', id)
  }

  const toggle = async () => {
    if (current === null) {
      if (playable.length) await playSurah(playable[0])
      return
    }
    if (playing) engine.current!.pause()
    else if (engine.current!.surah === current) await engine.current!.play()
    else await playSurah(current)
  }

  const currentView = surahs.find((s) => s.surah === current) ?? null
  const releasedTotal = surahs.filter((s) => s.released).reduce((a, s) => a + s.bytes, 0)

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return surahs
    const bare = plainName(q).toLowerCase()
    return surahs.filter(
      (s) =>
        plainName(s.name).includes(bare) ||
        s.nameEn.toLowerCase().includes(bare) ||
        String(s.surah) === bare,
    )
  }, [surahs, query])

  const openText = () => setTab('text')

  const favKey = current !== null ? dlKey(reciterId, current) : ''
  const toggleFavourite = async () => {
    if (current === null) return
    const next = favourites.includes(favKey)
      ? favourites.filter((k) => k !== favKey)
      : [...favourites, favKey]
    setFavourites(next)
    await setPref('favourites', next)
  }

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    const f = (e.clientX - r.left) / r.width
    engine.current!.seek(Math.max(0, Math.min(1, f)) * duration)
  }

  const recordVerdict = async (surah: number, verdict: Verdict) => {
    await setVerdict(reciterId, surah, verdict)
    setVerdicts(await getVerdicts())
  }

  const saveImported = async (items: Array<{ surah: number; file: File }>) => {
    for (const { surah, file } of items) {
      await putAudio(reciterId, surah, file, 'import')
    }
    await refreshDownloaded()
  }

  const checkable = useMemo(() => surahs.filter((s) => s.released), [surahs])

  const changeLang = async (next: Lang) => {
    setLang(next)
    await setPref('lang', next)
  }

  /** Everything not already saved for this reciter. */
  const missing = useMemo(
    () => [...urls.entries()].filter(([n]) => !downloadedHere.has(n)),
    [urls, downloadedHere],
  )
  // What the download will actually pull over the network. A surah that is
  // half stored only needs its remainder, so quoting the full size would
  // overstate the cost and could refuse a download that comfortably fits.
  const missingBytes = useMemo(
    () =>
      surahs
        .filter((s) => s.released && !downloadedHere.has(s.surah))
        .reduce((a, s) => a + s.bytes * (1 - (partialsHere.get(s.surah) ?? 0)), 0),
    [surahs, downloadedHere, partialsHere],
  )

  const startDownloadAll = () => {
    for (const [n, u] of missing) queue.current!.enqueue({ reciterId, surah: n, url: u })
    setConfirmAll(false)
  }

  useEffect(() => {
    if (!isNativeShell()) return
    publishNowPlaying(
      currentView && reciter
        ? {
            surah: currentView.surah,
            title: `${t.surahWord} ${currentView.name}`,
            reciter: artistFor(currentView, reciter),
            artwork: reciter.photo
              ? `${import.meta.env.BASE_URL}${reciter.photo}`
              : null,
            playing,
            progress: duration ? time / duration : 0,
          }
        : null,
    )
    // Position is deliberately not a dependency: pushing it every frame would
    // cross the bridge sixty times a second for a bar that redraws far less
    // often. The accessory updates on the transitions that matter.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentView?.surah, reciter?.id, playing])

  /**
   * Keyboard transport.
   *
   * Space and the arrows are what a listener reaches for before the mouse.
   * They are ignored while a field or a control has focus, so typing a surah
   * name into the search box does not pause the recitation on every space.
   */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null
      const tag = el?.tagName
      if (
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        el?.isContentEditable
      ) {
        return
      }
      // The transport keys act on the player even when a button has focus;
      // Enter and Space on a focused button are the browser's to handle.
      if (e.code === 'Space' && tag !== 'BUTTON') {
        e.preventDefault()
        void toggle()
        return
      }
      if (current === null) return
      // Left and right are mirrored in an RTL interface: back is the side
      // the text runs from.
      const back = t.dir === 'rtl' ? 'ArrowRight' : 'ArrowLeft'
      const forward = t.dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight'
      if (e.key === back) {
        e.preventDefault()
        engine.current!.seek(Math.max(0, time - 10))
      } else if (e.key === forward) {
        e.preventDefault()
        engine.current!.seek(time + 10)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggle, current, time, t.dir])

  /*
   * The list's props have to keep their identity between renders or
   * memoising it is pointless — a fresh closure is a changed prop. This
   * matters because `timeupdate` sets `time` about four times a second, and
   * without it all 114 rows reconcile on every tick while the user scrolls.
   */
  const isVerified = useCallback(
    (s: SurahView) => effectiveVerified(reciterId, s, verdicts),
    [reciterId, verdicts],
  )

  const startSurah = useCallback((n: number) => void playSurah(n), [playSurah])

  const startDownload = useCallback(
    (n: number) => {
      const u = urls.get(n)
      if (!u) return
      const bytes = surahs.find((x) => x.surah === n)?.bytes
      queue.current!.enqueue({ reciterId, surah: n, url: u, bytes })
    },
    [urls, surahs, reciterId],
  )

  const dockTabs: DockTab[] = useMemo(
    () => [
      { id: 'library', label: t.tabLibrary, icon: <Library size={21} />, onSelect: () => setTab('library') },
      { id: 'quran', label: t.tabQuran, icon: <QuranMark size={21} />, onSelect: () => setTab('quran') },
      { id: 'text', label: t.tabText, icon: <Broadcast size={21} />, onSelect: openText },
      { id: 'hifz', label: t.tabHifz, icon: <Heart size={21} />, onSelect: () => setTab('hifz') },
      { id: 'more', label: t.tabMore, icon: <More size={21} />, onSelect: () => setTab('more') },
    ],
    [t, openText],
  )

  const pct = duration ? (time / duration) * 100 : 0

  return (
    <div className="app" dir={t.dir}>
      <Splash lang={lang} />
      <div className="sheet">
        <div className="sheet-head">
          <h1 className="wordmark">
            <span className="wordmark-main">{brandName(lang)}</span>
            <span className="wordmark-alt">
              {brandSecondary(lang)} · {t.appTitle}
            </span>
          </h1>
          <div className="head-actions">
            <button
              className="round"
              aria-pressed={shuffle}
              aria-label={t.shuffle}
              onClick={() => setShuffle(!shuffle)}
            >
              <Shuffle size={20} />
            </button>
            <button
              className="round"
              aria-pressed={repeat !== 'off'}
              aria-label={t.repeat}
              onClick={() =>
                setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')
              }
            >
              {repeat === 'one' ? <RepeatOne size={20} /> : <Repeat size={20} />}
            </button>
          </div>
        </div>

        {reciters.length > 1 && (
          <div className="reciters" role="tablist" aria-label="القارئ">
            {reciters.map((r) => (
              <button
                key={r.id}
                role="tab"
                aria-selected={r.id === reciterId}
                className="chip"
                // The strip scrolls, and the reciter you are listening to is
                // the one that has to be on screen — otherwise it sits off
                // the edge and the row looks arbitrary.
                ref={r.id === reciterId ? selectedChip : undefined}
                onClick={() => void switchReciter(r.id)}
              >
                <span className="chip-name">{r.name}</span>
                {riwayahLabel(r, lang) && (
                  <span className="chip-riwayah">({riwayahLabel(r, lang)})</span>
                )}
                <span className="chip-meta">{r.surahs.length}/114</span>
              </button>
            ))}
          </div>
        )}

        {tab === 'quran' && (
          <div className="search">
            <Search size={20} />
            <input
              ref={searchRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.search}
              aria-label={t.search}
            />
          </div>
        )}

        <div className="scroll" ref={scrollRef}>
          {tab === 'quran' && (
            <SurahList
              surahs={filtered}
              reciterId={reciterId}
              lang={lang}
              t={t}
              downloaded={downloadedHere}
              partials={partialsHere}
              progress={progress}
              current={current}
              verified={isVerified}
              rejected={rejected}
              onPlay={startSurah}
              onDownload={startDownload}
            />
          )}

          {tab === 'library' && (
            <div className="panel">
              <h2>{t.storage}</h2>
              <p>{t.storageIntro}</p>

              <div className="meter">
                <span
                  style={{
                    width: quota.quota
                      ? `${Math.min(100, (quota.usage / quota.quota) * 100)}%`
                      : '0%',
                  }}
                />
              </div>
              <p>
                {t.usedOf(formatBytes(quota.usage), formatBytes(quota.quota))} ·{' '}
                {t.savedCount(downloadedHere.size)}
              </p>

              {persisted !== null && (
                <p className={persisted ? 'saved-note' : 'verify-err'}>
                  {persisted ? t.storageSafe : t.storageAtRisk}
                </p>
              )}

              {queued > 0 ? (
                <>
                  <p className="count">
                    {t.downloading(
                      surahs.filter((s) => s.released).length - queued,
                      surahs.filter((s) => s.released).length,
                    )}
                  </p>
                  <button
                    className="btn"
                    onClick={() => {
                      // cancel() aborts an active download and drops a pending
                      // one, so this alone empties the queue.
                      for (const n of urls.keys()) queue.current!.cancel(reciterId, n)
                      setQueued(0)
                      void refreshDownloaded()
                    }}
                  >
                    {t.cancelAll}
                  </button>
                </>
              ) : (
                <button
                  className="btn solid"
                  disabled={!missing.length}
                  onClick={() => setConfirmAll(true)}
                >
                  {t.downloadAllSize(formatBytes(missingBytes))}
                </button>
              )}

              {!canDownloadAll(missingBytes, quota.free) && missing.length > 0 && (
                <p className="verify-err">
                  {t.notEnoughSpace(formatBytes(missingBytes), formatBytes(quota.free))}
                </p>
              )}

              <button
                className="btn"
                disabled={!downloadedHere.size}
                onClick={async () => {
                  for (const n of downloadedHere) await deleteAudio(reciterId, n)
                  await refreshDownloaded()
                }}
              >
                {t.deleteSaved}
              </button>

              {reciter && (
                <ImportPanel
                  reciterName={reciter.name}
                  meta={surahMeta}
                  t={t}
                  onSave={saveImported}
                />
              )}
            </div>
          )}

          {tab === 'text' && (
            <div className="panel">
              {!isHafs(reciter) ? (
                <PagedMushaf
                  t={t}
                  riwayah={riwayahLabel(reciter, lang) ?? ''}
                  gotoPage={gotoPage}
                  onWentToPage={() => setGotoPage(null)}
                />
              ) : !currentView ? (
                <p className="empty">{t.pickSurahForText}</p>
              ) : (
                <MushafView
                  surah={currentView.surah}
                  time={time}
                  reciterId={reciterId}
                  t={t}
                  onSeek={(sec) => engine.current!.seek(sec)}
                  activeLine={drill?.segment ?? null}
                  yourTurn={drill?.phase === 'echo'}
                  riwayah={riwayahLabel(reciter, lang)}
                  gotoPage={gotoPage}
                  onWentToPage={() => setGotoPage(null)}
                  onPeek={(pg, ms) => void addPeek(pg, ms, Date.now())}
                  onStumble={(key, pg) => void markStumble(key, pg)}
                />
              )}
            </div>
          )}

          {tab === 'hifz' && (
            <div className="panel">
              <HifzBoard t={t} onOpenPage={(p) => openMushafAtPage(p)} />
              <h3 className="hifz-h">{t.forkDrill}</h3>
              <ForkDrill
                t={t}
                reciterId={reciterId}
                playRange={playRange}
                stop={() => engine.current!.pause()}
              />
            </div>
          )}

          {tab === 'more' && (
            <div className="panel">
              <h2>{t.settings}</h2>
              <LangPicker
                lang={lang}
                label={t.language}
                onChange={(next) => void changeLang(next)}
              />

              <ThemePicker
                t={t}
                lang={lang}
                theme={theme}
                mode={appearance}
                onTheme={(id) => {
                  setTheme(id)
                  void setPref('theme', id)
                }}
                onMode={(m) => {
                  setAppearance(m)
                  void setPref('appearance', m)
                }}
              />

              <h2 style={{ marginTop: '1.6rem' }}>{t.reciters}</h2>
              {reciters.map((r) => (
                <p key={r.id}>
                  <strong>{r.fullName}</strong>
                  <br />
                  {r.mushaf}
                  <br />
                  {t.recorded(r.surahs.length)}
                  {r.note ? (
                    <>
                      <br />
                      <span style={{ color: 'var(--muted)' }}>{r.note}</span>
                    </>
                  ) : null}
                </p>
              ))}

              <VerifyPanel
                reciterId={reciterId}
                surahs={checkable}
                verdicts={verdicts}
                t={t}
                onVerdict={(surah, v) => void recordVerdict(surah, v)}
              />
            </div>
          )}
        </div>
      </div>

      {currentView && reciter && !playerMin && (
        <div
          className="sheet-scrim"
          onClick={() => {
            setPlayerMin(true)
            void setPref('playerMin', true)
          }}
        />
      )}

      {currentView && reciter && !playerMin && (
        <div className={`player${playerMin ? ' is-min' : ''}`}>
          {/* The grabber. Folding the player away is the difference between
              seeing four surahs and seeing ten, so it is a full-width target
              rather than a small chevron in a corner. */}
          <button
            className="player-handle"
            aria-expanded={!playerMin}
            aria-label={playerMin ? t.expandPlayer : t.collapsePlayer}
            onClick={() => {
              const next = !playerMin
              setPlayerMin(next)
              void setPref('playerMin', next)
            }}
          >
            <span className="handle-bar" aria-hidden="true" />
            <Chevron size={18} />
            <span className="mini-now">سُورَةُ {currentView.name}</span>
          </button>

          <div className="player-fold">
            <div className="player-fold-inner">
          <div className="player-top">
            <div
              className="medallion"
              aria-hidden="true"
              data-reciter={reciter.id}
              style={{
                ['--face-src' as string]: reciter.photo
                  ? `url('${import.meta.env.BASE_URL}${reciter.photo}')`
                  : 'none',
              }}
            />

            <div className="now">
              <div className="surah-name">سُورَةُ {currentView.name}</div>
              <div className="label">{t.reciter}</div>
              <div className="reciter-ar">{reciter.fullName}</div>
              <div className="reciter-en">{reciter.nameEn}</div>
              {riwayahLabel(reciter, lang) && (
                <div className="reciter-riwayah">({riwayahLabel(reciter, lang)})</div>
              )}
              {/* The entry name above is the collection — "Taraweeh 1447" —
                  which does not say whose voice this is. Both belong here:
                  the collection identifies the recording, the imam
                  identifies the recitation. */}
              {voiceLabel(currentView, lang) && (
                <div className="reciter-voice">
                  {t.recitedBy} {voiceLabel(currentView, lang)}
                </div>
              )}
            </div>

            <div className="player-actions">
              <button
                className="round"
                aria-label={t.talqeen}
                aria-pressed={talqeen}
                onClick={() => {
                  if (!hasTimings(reciterId)) {
                    setError(t.talqeenNeedsTimings)
                    return
                  }
                  setTalqeen(!talqeen)
                }}
              >
                <TalqeenIcon size={20} />
              </button>
              {canCast && (
                <button
                  className="round"
                  aria-label={t.cast}
                  onClick={() => void engine.current!.promptRemote()}
                >
                  <Cast size={20} />
                </button>
              )}
              <button
                className="round"
                aria-label={t.favourite}
                aria-pressed={favourites.includes(favKey)}
                onClick={toggleFavourite}
              >
                <Star size={20} filled={favourites.includes(favKey)} />
              </button>
            </div>
          </div>

          {talqeen && drill && (
            <div className={`talqeen-bar${drill.phase === 'echo' ? ' is-yours' : ''}`}>
              <span className="talqeen-who">
                {drill.phase === 'echo' ? t.yourTurn : t.listenNow}
              </span>
              <span className="talqeen-acts">
                <button
                  type="button"
                  className="btn"
                  onClick={() => talqeenRef.current?.repeat()}
                >
                  {t.hearAgain}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={() => talqeenRef.current?.skipEcho()}
                  disabled={drill.phase !== 'echo'}
                >
                  {t.skipTurn}
                </button>
              </span>
            </div>
          )}
            </div>
          </div>

          <div className="controls">
            <button
              className="ctrl"
              aria-label={t.speed}
              onClick={() => {
                const i = (speedIdx + 1) % SPEEDS.length
                setSpeedIdx(i)
                engine.current!.setRate(SPEEDS[i])
              }}
            >
              {SPEEDS[speedIdx]}x
            </button>

            <button
              className="ctrl"
              aria-label={t.prev}
              onClick={() => {
                const p = prevSurah(currentView.surah, playable)
                if (p) void playSurah(p)
              }}
            >
              <Back size={26} />
            </button>

            <button
              className="ctrl big"
              aria-label={playing ? t.pause : t.play}
              onClick={toggle}
            >
              {busy ? '…' : playing ? <Pause size={26} /> : <Play size={26} />}
            </button>

            {/* Kept when folded: moving to the next surah is the one thing
                besides play you reach for without opening the player. */}
            <button
              className="ctrl keep-min"
              aria-label={t.next}
              onClick={() => void advance()}
            >
              <Forward size={26} />
            </button>

            <button
              className="ctrl"
              aria-label={t.stumble}
              disabled={current === null}
              onClick={() => {
                const key = currentWordKey()
                if (key) void markStumble(key)
              }}
            >
              <Stumble size={22} />
            </button>

            <button
              className="ctrl"
              aria-label={t.sleep}
              aria-pressed={sleepAt !== null}
              onClick={() => setSleepAt(sleepAt === null ? 30 : sleepAt === 30 ? 60 : null)}
            >
              <Moon size={22} />
            </button>
          </div>

          <div className="progress">
            <div
              className="track"
              onClick={seekTo}
              role="slider"
              tabIndex={0}
              aria-label={t.position}
              aria-valuemin={0}
              aria-valuemax={Math.round(duration)}
              aria-valuenow={Math.round(time)}
              onKeyDown={(e) => {
                if (e.key === 'ArrowRight') engine.current!.seek(time + 10)
                if (e.key === 'ArrowLeft') engine.current!.seek(time - 10)
              }}
            >
              <div className="fill" style={{ width: `${pct}%` }} />
              <div className="knob" style={{ left: `${pct}%` }} />
            </div>
            {canCast && mode === 'offline' && (
              <p className="mushaf-note">{t.castOffline}</p>
            )}
            <div className="times">
              <span>{formatTime(time)}</span>
              <span className="badge">
                {mode === 'offline' ? t.saved : t.streaming}
                {sleepAt ? ` · ${sleepAt}د` : ''}
              </span>
              <span>-{formatTime(Math.max(0, duration - time))}</span>
            </div>
          </div>

          {error && <p className="err">{error}</p>}
        </div>
      )}

      {confirmAll && reciter && (
        <div
          className="scrim"
          role="dialog"
          aria-modal="true"
          aria-label={t.confirmTitle}
          onClick={() => setConfirmAll(false)}
        >
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <h3>{t.confirmTitle}</h3>
            <p>{t.confirmBody(reciter.name, missing.length, formatBytes(missingBytes))}</p>
            <div className="dialog-actions">
              <button className="btn" onClick={() => setConfirmAll(false)}>
                {t.confirmNo}
              </button>
              <button className="btn solid" onClick={startDownloadAll}>
                {t.confirmYes}
              </button>
            </div>
          </div>
        </div>
      )}

      <Dock
        t={t}
        tabs={dockTabs}
        active={tab}
        now={
          currentView && reciter
            ? {
                title: `${t.surahWord} ${currentView.name}`,
                reciter: artistForEn(currentView, reciter),
                // Still the entry's id: the dock uses it to frame the photo,
                // which is the collection's image, not the imam's.
                reciterId: reciter.id,
                artwork: reciter.photo
                  ? `${import.meta.env.BASE_URL}${reciter.photo}`
                  : null,
                playing,
              }
            : null
        }
        onOpenPlayer={() => {
          setPlayerMin(false)
          void setPref('playerMin', false)
        }}
        onToggle={toggle}
        onNext={() => void advance()}
        onSearch={() => {
          setTab('quran')
          // The field is in the panel that is about to mount, so focus waits
          // for it rather than racing it.
          window.setTimeout(() => searchRef.current?.focus(), 60)
        }}
        scroller={scrollRef}
      />
    </div>
  )
}
