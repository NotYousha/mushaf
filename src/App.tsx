import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadCatalog, buildView, surahMeta } from './catalog/load'
import { searchSurahs } from './catalog/search'
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
import {
  clearFaces,
  deleteFace,
  exportFaces,
  importFaces,
  loadFaces,
  putFace,
  revokeFaces,
  setFraming,
  type Face,
} from './db/faces'
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
import { nextSurah, nextVoiceChange, prevSurah, type RepeatMode } from './player/playQueue'
import { getQuota, requestPersistence, canDownloadAll } from './storage/quota'
import { SurahList, plainName } from './ui/SurahList'
import { VerifyPanel } from './ui/VerifyPanel'
import { FavouritesPanel } from './ui/FavouritesPanel'
import { FacePanel } from './ui/FacePanel'
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
  SkipBack,
  SkipForward,
  NextVoice,
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
import { arabicDigits, imamsOf, PLACES, type Place } from './catalog/mosques'
import {
  imamAt,
  imamName,
  nextChangeAfter,
  segmentsFor,
} from './catalog/segments'
import { digits, inScript, isArabicScript } from './i18n/script'
import { Splash } from './ui/Splash'
import { BUILD } from './pwa'
import './ui/theme.css'
import './ui/themes.css'
import './ui/glass.css'
import './ui/motion.css'
import './ui/desktop.css'

type Tab = 'quran' | 'library' | 'text' | 'hifz' | 'more'
const SPEEDS = [1, 1.25, 1.5, 0.75]
/** The transport's fixed jump. Ten seconds is the convention, and it is short
 *  enough to land back on the start of an ayah you half-caught. */
const SKIP_SECONDS = 10

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
  /**
   * Which mosque's year picker is open, if any.
   *
   * Closed by default, and closed again once a year is chosen: fifty-odd rows
   * standing open under the strip pushes the surahs off the screen for
   * everyone, including the people who never touch them. Only one opens at a
   * time, so the two never stack.
   */
  const [yearsOpen, setYearsOpen] = useState<Place | null>(null)
  /** Portraits the listener has added, imam id to object URL. */
  const [faces, setFaces] = useState<Map<string, Face>>(new Map())
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

  /**
   * Where the last session stopped, until it is used once.
   *
   * Held in a ref rather than state: it must survive the render that follows
   * restoring it, and it must not make the app think the playhead has moved.
   */
  const resumeAt = useRef<number | null>(null)

  const engine = useRef<PlayerEngine | null>(null)
  if (!engine.current) engine.current = new PlayerEngine()

  const reciter = useMemo(
    () => reciters.find((r) => r.id === reciterId) ?? reciters[0] ?? null,
    [reciters, reciterId],
  )

  const surahs = useMemo(() => (reciter ? buildView(reciter, surahMeta) : []), [reciter])

  /**
   * The reciter strip holds the individual mushafs; the Grand Mosque's
   * thirty-three years get their own list.
   *
   * They are all ordinary reciters underneath — switching to one, saving from
   * it and playing it go through exactly the same paths. Only where they are
   * offered differs, because thirty-three more chips in a horizontal strip
   * would bury the four mushafs that belong there and make the strip a thing
   * to scroll past rather than choose from.
   */
  const individual = useMemo(() => reciters.filter((r) => !r.group), [reciters])
  /** Each mosque's years, newest first, keyed by mosque. */
  const mosqueYears = useMemo(() => {
    const by = new Map<Place, Reciter[]>()
    for (const m of PLACES) {
      by.set(m.place, reciters.filter((r) => r.group === m.place && r.year))
    }
    return by
  }, [reciters])
  /** The mosque and year being listened to, or nulls when it is a mushaf. */
  const openPlace = (reciter?.group ?? null) as Place | null
  const openYear = openPlace ? (reciter?.year ?? null) : null

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

  /**
   * Portraits are read once and held as object URLs.
   *
   * The player re-renders about four times a second while playing, so making
   * a URL per render would leak one every time. Replacing the map revokes the
   * old URLs first, following the same revoke-before-create discipline the
   * player engine uses for audio.
   */
  useEffect(() => {
    let alive = true
    let held: Map<string, Face> | null = null
    void loadFaces().then((m) => {
      if (!alive) {
        revokeFaces(m)
        return
      }
      held = m
      setFaces(m)
    })
    return () => {
      alive = false
      revokeFaces(held)
    }
  }, [])

  /**
   * Reload the portraits, releasing the ones being replaced.
   *
   * The revoke happens here rather than inside the state updater: an updater
   * must be pure, and React is free to call it more than once — which would
   * revoke a URL the next render still needs.
   */
  const refreshFaces = useCallback(async () => {
    const next = await loadFaces()
    setFaces((prev) => {
      queueMicrotask(() => revokeFaces(prev))
      return next
    })
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
        /**
         * And where in it.
         *
         * The engine has been writing the playhead every five seconds, on
         * pause and on the app going to the background, and the app was
         * reading everything back except the one number that matters. Someone
         * an hour and a half into a Taraweeh night closed the app and came
         * back to 00:00 of a hundred-minute recording, with a four-pixel
         * scrubber to find their place again.
         */
        setTime(pos.seconds)
        resumeAt.current = pos.seconds
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
      /**
       * Move the clock with the surah, not after it.
       *
       * The element keeps the previous position until the new audio loads and
       * reports one, so for those seconds the app was asking who recites forty
       * minutes into a surah it had only just opened — and drawing that imam's
       * face and name. On a slow connection the wrong reciter sat there for
       * the whole of the load.
       */
      setTime(startAt)

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
      setNavAvailability(
        nextSurah(surah, repeat, playable) !== null,
        engine.current!.handlers,
      )
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
          // No timings for this reciter, so fall back to the same fixed jump
          // the transport's own skip buttons make.
          const end = Number.isFinite(el.duration) ? el.duration : null
          const next = el.currentTime + dir * SKIP_SECONDS
          el.currentTime = Math.max(0, end === null ? next : Math.min(next, end - 0.25))
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

  /**
   * Jump by a fixed number of seconds, clamped to the recording.
   *
   * Clamping at both ends matters here: these are two-hour Taraweeh files, and
   * seeking past the end makes some browsers fire `ended` and advance to the
   * next surah — so an over-shoot at the tail would skip a surah rather than
   * land at its close.
   */
  const skipBy = (seconds: number) => {
    const el = engine.current!.el
    const end = Number.isFinite(el.duration) ? el.duration : null
    const next = el.currentTime + seconds
    engine.current!.seek(Math.max(0, end === null ? next : Math.min(next, end - 0.25)))
  }

  const toggle = async () => {
    if (current === null) {
      if (playable.length) await playSurah(playable[0])
      return
    }
    if (playing) {
      engine.current!.pause()
      return
    }
    if (engine.current!.surah === current) {
      await engine.current!.play()
      return
    }
    // First press after opening the app: pick up where the last one stopped.
    const from = resumeAt.current ?? 0
    resumeAt.current = null
    await playSurah(current, from)
  }

  const currentView = surahs.find((s) => s.surah === current) ?? null
  /**
   * The portrait to show, and whose it is.
   *
   * A surah's own reciter wins over the entry's: on a Taraweeh year the imam
   * changes from surah to surah, and the face has to change with him or it is
   * telling the listener something untrue.
   */
  /**
   * The portrait to show, and whose it is.
   *
   * The listener's own picture of this surah's imam wins, then a shipped one,
   * then the entry's. A user photo is already cropped square on import, so it
   * needs none of the per-reciter framing the bundled originals do.
   */
  /**
   * Who is reciting at this very moment.
   *
   * A Taraweeh surah is a stitch: Al-Baqarah passes between seven imams, so
   * the reciter is a function of where the playhead is, not of the surah. Where
   * no changeovers are published this falls back to the surah's own
   * attribution, which is what every other year has.
   */
  const liveImam =
    openPlace && openYear && current !== null
      ? imamAt(openPlace, openYear, current, time)
      : null
  const liveWho = imamName(liveImam)
  const voiceIdNow = liveImam ?? currentView?.voiceId ?? null

  const mine = voiceIdNow ? faces.get(voiceIdNow) : undefined
  /**
   * The portrait's filename — never a path.
   *
   * Every branch here yields a bare name and the prefix is added once, where
   * it is drawn. Having one branch pre-prefix it produced
   * `/mushaf//mushaf/imam-baleela.webp`, which quietly 404s: the portrait
   * appeared on a surah with a single reciter and vanished on every surah that
   * changed hands, which is exactly the wrong way round.
   */
  const face =
    mine?.url ??
    liveWho?.photo ??
    currentView?.voicePhoto ??
    reciter?.photo ??
    null
  const faceIsMine = !!mine
  /**
   * The portrait as something drawable.
   *
   * A picture the listener added is already an object URL; a bundled one is a
   * filename that needs the deployment prefix. Resolved here, once, so the
   * player and the dock cannot disagree about it.
   */
  const faceSrc = face
    ? faceIsMine
      ? face
      : `${import.meta.env.BASE_URL}${face}`
    : null
  /**
   * How the portrait is framed.
   *
   * The listener's own picture carries their framing. A bundled portrait is
   * cropped square before it ships, so it wants none — but "none" cannot mean
   * "leave it to the stylesheet", because the stylesheet's default is Al
   * Dosari's old uncropped photograph at 160% and well off centre, and every
   * portrait that is not named in one short CSS rule inherits it. That blew up
   * sixteen faces until each looked like somebody else.
   *
   * So a square portrait states its framing outright.
   */
  const SQUARE = { zoom: 100, x: 50, y: 50 }
  const bundledIsSquare = !!face && face.startsWith('imam-')
  const faceFrame =
    mine?.player ??
    liveWho?.frames?.player ??
    (bundledIsSquare ? SQUARE : null)
  const cardFrame =
    mine?.card ?? liveWho?.frames?.card ?? (bundledIsSquare ? SQUARE : null)
  const facePerson = voiceIdNow ?? reciter?.id ?? ''

  /**
   * Where the voice next changes hands, on a year that names its reciters.
   *
   * Null on every other entry, which is what keeps the control off the screen
   * for the four single-voice mushafs — there is nothing to step through when
   * one sheikh recites the whole thing.
   */
  const voiceOfSurah = useCallback(
    (n: number) => surahs.find((v) => v.surah === n)?.voice ?? null,
    [surahs],
  )
  /**
   * Where the recitation next changes hands.
   *
   * Inside the surah first, where the changeovers are published — that is the
   * whole point on a surah like Al-Baqarah, which passes between seven imams
   * across an hour and three quarters. Only when there is nothing left in this
   * surah does it move to the next one a different imam recites.
   */
  const nextVoice = useMemo(() => {
    if (current === null) return null
    if (openPlace && openYear) {
      const within = nextChangeAfter(openPlace, openYear, current, time)
      if (within) return { kind: 'within' as const, at: within.at, id: within.id }
    }
    const surah = nextVoiceChange(current, playable, voiceOfSurah)
    return surah === null ? null : { kind: 'surah' as const, surah }
  }, [current, time, openPlace, openYear, playable, voiceOfSurah])
  const releasedTotal = surahs.filter((s) => s.released).reduce((a, s) => a + s.bytes, 0)

  const filtered = useMemo(() => {
    const q = query.trim()
    if (!q) return surahs
    return searchSurahs(surahs, q)
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

  /**
   * Direction and language belong on <html>, not on a wrapper.
   *
   * Below the wrapper it would leave the scrollbar on the wrong side, the
   * page canvas unflipped, and native controls — the import panel's select —
   * laid out against the text. The lang attribute matters as much: it picks
   * the font fallback, the hyphenation and the screen reader's voice, and it
   * was hardcoded to English for every language.
   */
  useEffect(() => {
    const el = document.documentElement
    el.setAttribute('lang', lang)
    el.setAttribute('dir', t.dir)
  }, [lang, t.dir])

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
    // The byte count has to travel with the job. Without it the queue reads
    // every bulk download as small and runs three at once — which for a
    // Taraweeh year of 40-95 MB surahs is exactly the three-stuck-at-30%
    // state the single-file limit exists to prevent, while tapping any one of
    // those same surahs on its own behaved correctly.
    for (const [n, u] of missing) {
      const s = surahs.find((x) => x.surah === n)
      queue.current!.enqueue({ reciterId, surah: n, url: u, bytes: s?.bytes })
    }
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
            // The native shell's accessory shows the same face as the app.
            artwork: faceSrc,
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

        {(individual.length > 1 || mosqueYears.size > 0) && (
          <div className="reciters" role="tablist" aria-label="القارئ">
            {individual.map((r) => (
              <button
                key={r.id}
                role="tab"
                aria-selected={r.id === reciterId}
                className="chip"
                // The strip scrolls, and the reciter you are listening to is
                // the one that has to be on screen — otherwise it sits off
                // the edge and the row looks arbitrary.
                ref={r.id === reciterId ? selectedChip : undefined}
                onClick={() => {
                  setYearsOpen(null)
                  void switchReciter(r.id)
                }}
              >
                {/* A name, not a translation: the same name written so the
                    reader can say it. Hardcoding the Arabic here is what put
                    an English section label next to ياسر الدوسري in one row. */}
                <span className="chip-name">{inScript(lang, r.name, r.nameEn)}</span>
                {riwayahLabel(r, lang) && (
                  <span className="chip-riwayah">({riwayahLabel(r, lang)})</span>
                )}
                <span className="chip-meta">
                  {digits(lang, r.surahs.length)}/{digits(lang, 114)}
                </span>
              </button>
            ))}

            {/* One chip per mosque, standing for all its years. Each opens a
                picker rather than selecting anything, because there is no
                sensible default year to jump to — and it reads as selected
                whenever one of its own years is the thing playing. */}
            {PLACES.map((m) => {
              const years = mosqueYears.get(m.place) ?? []
              if (!years.length) return null
              const here = openPlace === m.place
              const open = yearsOpen === m.place
              return (
                <button
                  key={m.place}
                  role="tab"
                  aria-selected={here}
                  aria-expanded={open}
                  aria-controls={`years-${m.place}`}
                  className={`chip chip-group${open ? ' is-open' : ''}`}
                  ref={here && !open ? selectedChip : undefined}
                  onClick={() => setYearsOpen(open ? null : m.place)}
                >
                  <span className="chip-name">{inScript(lang, m.shortAr, m.shortEn)}</span>
                  <span className="chip-meta">
                    {here && openYear !== null
                      ? isArabicScript(lang)
                        ? arabicDigits(openYear)
                        : openYear
                      : t.haramCount(digits(lang, years.length))}
                    <Chevron size={12} />
                  </span>
                </button>
              )
            })}
          </div>
        )}

        {PLACES.map((m) => {
          const years = mosqueYears.get(m.place) ?? []
          if (!years.length) return null
          const open = yearsOpen === m.place
          return (
            /* Kept mounted and collapsed rather than unmounted, so it folds
               away on the way out as well as on the way in. Closed, it is
               visibility:hidden, which takes it out of the tab order and off
               a screen reader without costing the animation. */
            <section
              key={m.place}
              className={`years${open ? ' is-open' : ''}`}
              id={`years-${m.place}`}
            >
              <div className="years-inner">
                <div className="years-head">
                  <h3>
                    {t.haramPick} · {inScript(lang, m.ar, m.en)}
                  </h3>
                  <span className="years-count">{t.haramCount(digits(lang, years.length))}</span>
                </div>
                {/* Newest first: the year someone wants is nearly always the
                    last one, and the oldest is a long scroll from the top. */}
                <div
                  className="years-scroll"
                  role="tablist"
                  aria-label={inScript(lang, m.ar, m.en)}
                >
                  {years.map((r) => {
                    const selected = r.id === reciterId
                    const led = imamsOf(m.place, r.year!)
                    return (
                      <button
                        key={r.id}
                        role="tab"
                        aria-selected={selected}
                        className={`year${selected ? ' is-on' : ''}`}
                        ref={selected ? selectedChip : undefined}
                        // Chosen, so the picker gets out of the way and gives
                        // the surahs back the screen it was holding.
                        onClick={() => {
                          setYearsOpen(null)
                          void switchReciter(r.id)
                        }}
                      >
                        <span className="year-num">
                          {isArabicScript(lang) ? arabicDigits(r.year!) : r.year}
                        </span>
                        <span className="year-body">
                          {r.ce ? <span className="year-ce">{r.ce}</span> : null}
                          {led.length > 0 && (
                            <span className="year-imams">
                              <span className="year-led">{t.haramLed}</span>{' '}
                              {led.map((i) => inScript(lang, i.name, i.nameEn)).join(' · ')}
                            </span>
                          )}
                        </span>
                        <span className="year-size">
                          {formatBytes(r.surahs.reduce((a, s) => a + s.bytes, 0), lang)}
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            </section>
          )
        })}

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
              <FavouritesPanel
                t={t}
                lang={lang}
                favourites={favourites}
                reciters={reciters}
                surahMeta={surahMeta}
                onPlay={(id, surah) => {
                  if (id !== reciterId) void switchReciter(id)
                  void playSurah(surah)
                  setTab('quran')
                }}
                onRemove={(key) => {
                  const next = favourites.filter((k) => k !== key)
                  setFavourites(next)
                  void setPref('favourites', next)
                }}
              />

              <h2 style={{ marginTop: '1.6rem' }}>{t.storage}</h2>
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
                {t.usedOf(formatBytes(quota.usage, lang), formatBytes(quota.quota, lang))} ·{' '}
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
                  {t.downloadAllSize(formatBytes(missingBytes, lang))}
                </button>
              )}

              {!canDownloadAll(missingBytes, quota.free) && missing.length > 0 && (
                <p className="verify-err">
                  {t.notEnoughSpace(formatBytes(missingBytes, lang), formatBytes(quota.free, lang))}
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
                  reciterName={inScript(lang, reciter.name, reciter.nameEn)}
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
              {/* One paragraph per year would be fifty-six of them saying
                  nearly the same thing. Each mosque is described once, and
                  its years chosen from the picker instead. */}
              {PLACES.map((m) => {
                const years = mosqueYears.get(m.place) ?? []
                if (!years.length) return null
                return (
                  <p key={m.place}>
                    <strong>{inScript(lang, m.ar, m.en)}</strong>
                    <br />
                    {years[years.length - 1].year}–{years[0].year} ·{' '}
                    {t.haramCount(digits(lang, years.length))}
                    <br />
                    <span style={{ color: 'var(--muted)' }}>{years[0].note}</span>
                  </p>
                )
              })}
              {individual.map((r) => (
                <p key={r.id}>
                  <strong>{inScript(lang, r.fullName, r.nameEn)}</strong>
                  <br />
                  {inScript(lang, r.mushaf, r.mushafEn)}
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

              {/* Which build is actually running. An installed app can serve
                  a cached copy for days, and without this there is no way to
                  tell "the fix did not work" from "the fix never arrived". */}
              <p className="build-stamp">
                {t.buildLabel} {BUILD}
                <button
                  type="button"
                  className="build-update"
                  onClick={() => {
                    // Drop every cache and re-register, which is the only
                    // thing that reliably shifts a stuck home-screen app.
                    void (async () => {
                      try {
                        if ('serviceWorker' in navigator) {
                          const regs = await navigator.serviceWorker.getRegistrations()
                          await Promise.all(regs.map((r) => r.unregister()))
                        }
                        if ('caches' in window) {
                          const keys = await caches.keys()
                          await Promise.all(keys.map((k) => caches.delete(k)))
                        }
                      } finally {
                        window.location.reload()
                      }
                    })()
                  }}
                >
                  {t.checkUpdate}
                </button>
              </p>

              <FacePanel
                t={t}
                lang={lang}
                base={import.meta.env.BASE_URL}
                faces={faces}
                onPick={async (imamId, file) => {
                  await putFace(imamId, file)
                  await refreshFaces()
                }}
                onFrame={async (imamId, surface, framing) => {
                  await setFraming(imamId, surface, framing)
                  await refreshFaces()
                }}
                onRemove={async (imamId) => {
                  await deleteFace(imamId)
                  await refreshFaces()
                }}
                onExport={async () => {
                  const doc = await exportFaces()
                  const blob = new Blob([JSON.stringify(doc)], { type: 'application/json' })
                  const url = URL.createObjectURL(blob)
                  const a = document.createElement('a')
                  a.href = url
                  a.download = `mushaf-photos-${doc.saved.replace(/[: ]/g, '-')}.json`
                  a.click()
                  // Give the download a moment to start before the URL goes.
                  setTimeout(() => URL.revokeObjectURL(url), 10_000)
                }}
                onClearAll={async () => {
                  const n = await clearFaces()
                  await refreshFaces()
                  return n
                }}
                onImport={async (file) => {
                  const n = await importFaces(await file.text())
                  await refreshFaces()
                  return n
                }}
              />

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
          <div className={`player-top${face ? '' : ' no-face'}`}>
            {/* The reciter of this surah, not of the entry.
                On a mosque year the imam changes between surahs, so the
                portrait follows what is playing; where a surah spanned
                several nights and several imams there is no one face to show,
                and the column collapses rather than showing an empty ring. */}
            {face && (
              <div
                className="medallion"
                aria-hidden="true"
                data-reciter={facePerson}
                style={{
                  ['--face-src' as string]: `url('${faceSrc}')`,
                  // An imported photo is cropped square on the way in, so it
                  // wants none of the nudging the uncropped originals need.
                  /* Framing follows the picture. A photo the listener added
                     carries their own; a bundled one carries whatever it was
                     cropped to before it shipped. Only a portrait with neither
                     falls back to the per-reciter CSS. */
                  ...(faceFrame
                    ? {
                        ['--face-zoom' as string]: `${faceFrame.zoom}%`,
                        ['--face-x' as string]: `${faceFrame.x}%`,
                        ['--face-y' as string]: `${faceFrame.y}%`,
                      }
                    : {}),
                }}
              />
            )}

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
              {(liveWho || voiceLabel(currentView, lang)) && (
                /* The name is the control. Whoever is reciting is what a
                   listener is already looking at, so stepping to the next one
                   belongs here rather than behind an unlabelled icon in a row
                   that only appears once the player is opened. */
                <button
                  type="button"
                  className="reciter-voice"
                  disabled={nextVoice === null}
                  aria-label={t.nextReciter}
                  onClick={() => {
                    if (!nextVoice) return
                    if (nextVoice.kind === 'within') engine.current!.seek(nextVoice.at)
                    else void playSurah(nextVoice.surah)
                  }}
                >
                  <span className="rv-label">{t.recitedBy}</span>{' '}
                  <span className="rv-name">
                    {liveWho
                      ? inScript(lang, liveWho.name, liveWho.nameEn)
                      : voiceLabel(currentView, lang)}
                  </span>
                  {nextVoice !== null && (
                    <span className="rv-next" aria-hidden="true">
                      <NextVoice size={15} />
                      {t.nextReciter}
                    </span>
                  )}
                </button>
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
              aria-label={t.prev}
              onClick={() => {
                const p = prevSurah(currentView.surah, playable)
                if (p) void playSurah(p)
              }}
            >
              <Back size={26} />
            </button>

            {/* Either side of play, which is where a thumb expects them.
                Folded away with the rest when the player is a strip. */}
            <button
              className="ctrl"
              aria-label={t.skipBack(SKIP_SECONDS)}
              onClick={() => skipBy(-SKIP_SECONDS)}
            >
              <SkipBack size={24} label={digits(lang, SKIP_SECONDS)} />
            </button>

            <button
              className="ctrl big"
              aria-label={playing ? t.pause : t.play}
              onClick={toggle}
            >
              {busy ? '…' : playing ? <Pause size={26} /> : <Play size={26} />}
            </button>

            <button
              className="ctrl"
              aria-label={t.skipForward(SKIP_SECONDS)}
              onClick={() => skipBy(SKIP_SECONDS)}
            >
              <SkipForward size={24} label={digits(lang, SKIP_SECONDS)} />
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
              <span>{formatTime(time, lang)}</span>
              <span className="badge">
                {mode === 'offline' ? t.saved : t.streaming}
                {sleepAt ? ` · ${sleepAt}د` : ''}
              </span>
              <span>-{formatTime(Math.max(0, duration - time), lang)}</span>
            </div>
          </div>

          {/* Settings, not transport. They used to sit in the same row as
              play, which put eight controls across a phone and squeezed the
              play button out of round. Quieter, smaller, and out of the way
              of the five things a thumb actually reaches for. */}
          <div className="controls-aux">
            {/* Only where the reciter actually changes. A Taraweeh year hands
                over between surahs rather than at a fixed point, so this jumps
                to the next surah a different imam recites. It is not a jump
                inside a surah: nothing published says where, within a surah
                that spanned several nights, one imam stopped and the next
                began. */}
            {(currentView?.voice ||
              (openPlace && openYear && current !== null
                ? !!segmentsFor(openPlace, openYear, current)
                : false)) && (
              <button
                className="ctrl small"
                aria-label={t.nextReciter}
                disabled={nextVoice === null}
                onClick={() => {
                  if (!nextVoice) return
                  // Within the surah it is a seek, not a track change: the
                  // audio is already loaded and the handover is a place in it.
                  if (nextVoice.kind === 'within') engine.current!.seek(nextVoice.at)
                  else void playSurah(nextVoice.surah)
                }}
              >
                <NextVoice size={22} />
              </button>
            )}
            <button
              className="ctrl small"
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
              className="ctrl small"
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
              className="ctrl small"
              aria-label={t.sleep}
              aria-pressed={sleepAt !== null}
              onClick={() => setSleepAt(sleepAt === null ? 30 : sleepAt === 30 ? 60 : null)}
            >
              <Moon size={22} />
            </button>
          </div>

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
            <p>
              {t.confirmBody(
                inScript(lang, reciter.name, reciter.nameEn),
                missing.length,
                formatBytes(missingBytes, lang),
              )}
            </p>
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

      {/* Outside the player sheet on purpose. This used to render inside it,
          and the sheet starts collapsed — so every message the app can raise
          was invisible by default: a surah that would not play, a download
          that failed, the disk filling up mid-save. A toast above the dock is
          reachable whatever else is open. */}
      {error && (
        <div className="toast" role="status" aria-live="polite">
          <p className="err">{error}</p>
          <button
            type="button"
            className="toast-x"
            aria-label={t.dismiss}
            onClick={() => setError(null)}
          >
            ×
          </button>
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
                reciter: isArabicScript(lang)
                  ? artistFor(currentView, reciter)
                  : artistForEn(currentView, reciter),
                // The dock shows this surah's reciter as well, framed for a
                // small square rather than the player's circle.
                reciterId: currentView.voiceId ?? reciter.id,
                // The same portrait the player is showing, resolved once.
                artwork: faceSrc,
                artFrame: cardFrame,
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
