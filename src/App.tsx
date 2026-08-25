import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadCatalog, buildView, surahMeta } from './catalog/load'
import { searchSurahs } from './catalog/search'
import type { Reciter, SurahView } from './catalog/types'
import {
  effectiveVerified,
  getVerdicts,
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
import { FavouritesPanel } from './ui/FavouritesPanel'
import { ImamPanel } from './ui/ImamPanel'
import { HomePanel, type HomeFace, type HomeResume } from './ui/HomePanel'
import { HOME_RECITERS } from './catalog/home'
import { ReciterPanel, type PlaceCard } from './ui/ReciterPanel'
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
  Home as HomeIcon,
} from './ui/Icons'
import { stringsFor, type Lang, bootLang, LANG_KEY } from './i18n'
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
  asMode,
  asTheme,
  bootPreference,
  watchSystemMode,
  type Mode,
  type ThemeId,
} from './ui/theming'
import { isHafs, riwayahLabel } from './catalog/riwayah'
import { artistFor, artistForEn, voiceLabel } from './catalog/voice'
import { allImams, arabicDigits, imamsOf, PLACES, type Place } from './catalog/mosques'
import {
  imamAt,
  imamName,
  nextChangeAfter,
  segmentsFor,
} from './catalog/segments'
import { digits, inScript, isArabicScript, isLatinText } from './i18n/script'
import { Splash } from './ui/Splash'
import { BUILD } from './pwa'
import './ui/theme.css'
import './ui/themes.css'
import './ui/glass.css'
import './ui/motion.css'
import './ui/desktop.css'
import './ui/home.css'

type Tab = 'home' | 'quran' | 'library' | 'text' | 'hifz' | 'more'

/**
 * A square portrait needs no framing, and stating that beats leaving it out.
 *
 * The stylesheet's default is Al-Dosari's uncropped photograph at 160% and
 * well off centre, so anything that does not state its own framing inherits a
 * crop meant for one particular face. Every portrait the crop script produces
 * is square; his is the one that is not.
 */
const SQUARE_FRAME = { zoom: 100, x: 50, y: 50 }
const UNCROPPED_PHOTOS = new Set(['sheikh.jpg'])
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
  // Opens on the home screen: the recitation you were in the middle of is
  // more useful than the top of a list of a hundred and fourteen surahs.
  const [tab, setTab] = useState<Tab>('home')
  const [query, setQuery] = useState('')
  const [quota, setQuota] = useState({ usage: 0, quota: 0, free: 0 })
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  // Seeded from the same synchronous copy the boot script read, so the first
  // render agrees with what is already stamped rather than flipping to it.
  const [lang, setLang] = useState<Lang>(() => bootLang())
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
  /**
   * The sheet on its way out.
   *
   * It used to unmount the frame the reader dismissed it — the largest surface
   * in the app disappearing between two frames, which is the most abrupt thing
   * here. It now stays mounted for the length of its exit and commits when the
   * animation ends. The preference is written immediately either way: what is
   * stored is the reader's choice, not the animation's progress.
   */
  const [leaving, setLeaving] = useState(false)
  /**
   * Seeded from the same copy the boot script read, never from the default.
   *
   * Starting these at the default meant the effect below stamped cream over
   * the palette the boot script had already put on <html>, and only the
   * IndexedDB read a second later put the real one back — the whole flash
   * happened after mount, not before it.
   */
  const [theme, setTheme] = useState<ThemeId>(() => bootPreference().theme)
  const [appearance, setAppearance] = useState<Mode>(() => bootPreference().mode)

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
      // IndexedDB is still the source of truth; the fallback is what was
      // already stamped, not a hardcoded language.
      setLang(await getPref<Lang>('lang', bootLang()))
      setPlayerMin(await getPref<boolean>('playerMin', true))
      // Falling back to the synchronous copy rather than to the default: iOS
      // evicts IndexedDB from apps it considers unused while leaving
      // localStorage alone, and a reader who comes back after a fortnight
      // should find their theme, not cream.
      const boot = bootPreference()
      setTheme(asTheme(await getPref<string>('theme', boot.theme), boot.theme))
      setAppearance(asMode(await getPref<string>('appearance', boot.mode), boot.mode))

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
    [surahs, playable, speedIdx, reciter, downloadedHere, rejected, repeat],
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

  /**
   * The surah queued to follow this one, chosen before it is needed.
   *
   * Held in a ref rather than state because it must not cause a render and
   * must be readable from the `ended` handler without waiting.
   */
  const upNext = useRef<number | null>(null)
  useEffect(() => {
    upNext.current = null
  }, [current, reciterId])

  /**
   * Resolve the next surah's source while sound is still coming out.
   *
   * Following on has to happen with nothing awaited. Asking IndexedDB whether
   * a saved copy exists is an await, and an await is a return to the event
   * loop -- which on a locked phone is precisely the moment iOS is free to
   * suspend the page, because playback has just stopped. The surah ended, the
   * app went to sleep reaching for the next one, and the recitation stopped
   * for the night.
   *
   * A minute out is early enough to cover a slow lookup and late enough that
   * a listener who skips around is not preparing surahs nobody will hear.
   */
  useEffect(() => {
    if (current === null || !reciter || duration <= 0) return
    const left = duration - time
    if (left < 0 || left > 60) return

    let n: number | null
    if (shuffle && playable.length) {
      // Picked once and kept: choosing again at the end would prepare one
      // surah and play another.
      const held = upNext.current
      if (held !== null && held !== current && playable.includes(held)) n = held
      else {
        const pool = playable.filter((x) => x !== current)
        n = pool.length ? pool[Math.floor(Math.random() * pool.length)] : null
      }
    } else {
      n = nextSurah(current, repeat, playable)
    }
    if (n === null) return

    const view = surahs.find((x) => x.surah === n)
    if (!view) return
    if (!view.released && !downloadedHere.has(n)) return
    if (rejected.has(n)) return

    upNext.current = n
    void engine.current!.prepareNext(reciter.id, n, view.url, view.fallbackUrl)
  }, [
    current,
    time,
    duration,
    shuffle,
    repeat,
    playable,
    surahs,
    reciter,
    downloadedHere,
    rejected,
  ])

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
      // The flag matters: it is how the system says the finger is still down,
      // and it is what lets the browser land on a keyframe instead of
      // decoding to an exact offset in a two-hour file.
      seek: (sec, fast) => engine.current!.seek(sec, fast),
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

  /**
   * Dismiss the sheet.
   *
   * Reduced motion closes it outright: someone who asked for less movement
   * gets the state change and none of the travel. Otherwise the exit runs and
   * onAnimationEnd commits, with a timer only as a backstop for the case where
   * the animation never runs at all and the event therefore never fires.
   */
  const closeSheet = useCallback(() => {
    void setPref('playerMin', true)
    const still =
      typeof window !== 'undefined' &&
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    if (still) {
      setPlayerMin(true)
      setLeaving(false)
      return
    }
    /* The sheet is about to go and focus is almost certainly inside it. Hand
       it back to the capsule the sheet came from, rather than letting it fall
       to <body> and strand a keyboard reader above the whole list. */
    if (document.activeElement instanceof HTMLElement &&
        document.activeElement.closest('.player')) {
      const back = document.querySelector<HTMLElement>('.cap-open')
      if (back) back.focus()
      else document.activeElement.blur()
    }
    setLeaving(true)
    window.setTimeout(() => {
      setLeaving((on) => {
        if (on) setPlayerMin(true)
        return false
      })
    }, 400)
  }, [])

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

      /*
       * The prepared surah first, and without awaiting anything.
       *
       * This is the whole point of preparing one: the audio is started here,
       * synchronously, while the browser still counts this as a continuing
       * session. Every piece of bookkeeping below it happens after sound is
       * already coming out, so none of it can cost us the handover.
       */
      const started = engine.current!.startPrepared()
      if (started !== null) {
        upNext.current = null
        setCurrent(started)
        setTime(0)
        setError(null)
        setMode(engine.current!.mode)
        const view = surahs.find((x) => x.surah === started)
        if (view && reciter) {
          updateMetadata(view, artistFor(view, reciter), import.meta.env.BASE_URL)
          setNavAvailability(
            nextSurah(started, repeat, playable) !== null,
            engine.current!.handlers,
          )
        }
        return
      }

      // Nothing was ready — the listener skipped to the end, or the next
      // surah could not be resolved. Take the ordinary path.
      void advance()
    }
    el.addEventListener('ended', onEnded)
    return () => el.removeEventListener('ended', onEnded)
  }, [advance, surahs, reciter, repeat, playable])

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
   * Play a surah belonging to some other reciter, optionally partway in.
   *
   * Switching reciter is a state change, so the catalogue the player reads
   * does not exist yet at the moment the switch is asked for. Calling
   * playSurah straight afterwards therefore looks the surah up in the
   * outgoing reciter's list and plays the wrong recording — silently, because
   * the surah number is valid in both. The request is instead parked until
   * the new catalogue has arrived and then honoured.
   */
  const [pendingPlay, setPendingPlay] = useState<{
    id: string
    surah: number
    at: number
  } | null>(null)

  const requestPlay = useCallback(
    (id: string, surah: number, at = 0) => {
      if (id === reciterId) {
        void playSurah(surah, at)
        return
      }
      setPendingPlay({ id, surah, at })
      void switchReciter(id)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [reciterId, playSurah],
  )

  useEffect(() => {
    if (!pendingPlay || pendingPlay.id !== reciterId || !surahs.length) return
    const { surah, at } = pendingPlay
    setPendingPlay(null)
    void playSurah(surah, at)
  }, [pendingPlay, reciterId, surahs, playSurah])

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
  // A row that carries only a framing has no picture of its own, so this asks
  // about the url rather than the row. Getting it from the row would treat a
  // bundled filename as an object URL and drop the deployment prefix.
  const faceIsMine = !!mine?.url
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
  const bundledIsSquare = !!face && !faceIsMine && !UNCROPPED_PHOTOS.has(face)
  /**
   * The framing that ships with whichever portrait is actually on screen.
   *
   * An imam reciting a surah of a Taraweeh year brings his own, from the
   * roster. Otherwise it is the entry's — but only when the face shown is
   * genuinely the entry's own: a surah attributed to someone else shows that
   * man, and a crop chosen for this one would cut a different face.
   */
  const bundledFrames =
    liveWho?.frames ??
    (face && !currentView?.voicePhoto && face === reciter?.photo
      ? reciter?.frames
      : undefined)
  const faceFrame =
    mine?.player ?? bundledFrames?.player ?? (bundledIsSquare ? SQUARE_FRAME : null)
  const cardFrame =
    mine?.card ?? bundledFrames?.card ?? (bundledIsSquare ? SQUARE_FRAME : null)
  const facePerson = voiceIdNow ?? reciter?.id ?? ''

  /**
   * The collection, when it is not just the reciter's name again.
   *
   * A Taraweeh year is titled by mosque and year and says nothing about whose
   * voice this is; an individual mushaf is titled after the man reciting it,
   * so printing both would print him twice.
   */
  const collectionLabel = (() => {
    if (!reciter || !currentView) return null
    const title = inScript(lang, reciter.name, reciter.nameEn)
    const shown = liveWho
      ? inScript(lang, liveWho.name, liveWho.nameEn)
      : (voiceLabel(currentView, lang) ?? title)
    return shown === title ? null : title
  })()

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

  /**
   * The portraits for the home screen, resolved once here.
   *
   * The rules for which picture wins and how it is cropped live in exactly
   * one place — duplicating them into the panel is what put a framing meant
   * for one man onto another's face the last time.
   */
  /**
   * Every mushaf as a face, for the "See all" screen.
   *
   * The home screen takes a subset of this — see homeFaces below. Resolved
   * once, here, because the rules for which picture wins and how it is cropped
   * are not something to have two copies of.
   */
  const allFaces = useMemo<HomeFace[]>(() => {
    /*
     * Several sheikhs are here more than once now — As-Sudais's Saudi Center
     * recording beside his complete murattal, Al-Juhany's Ad-Duri beside his
     * Hafs, Al-Buayjan's centre mushaf beside the Prophet's Mosque one. A
     * cell is a face and a name, so those would be two cards a listener
     * cannot tell apart. Where a name is shared, each card says which mushaf
     * it is; where it is not, nothing is added, because the name has already
     * answered the question.
     */
    const shared = new Set<string>()
    const seen = new Set<string>()
    for (const r of individual) {
      const label = inScript(lang, r.name, r.nameEn)
      if (seen.has(label)) shared.add(label)
      seen.add(label)
    }
    return individual.map((r) => {
      const own = faces.get(r.id)
      const mine = own?.url ?? null
      const photo = mine ?? r.photo ?? null
      const label = inScript(lang, r.name, r.nameEn)
      return {
        id: r.id,
        label,
        tag: shared.has(label) && r.tag ? inScript(lang, r.tag, r.tagEn) : null,
        src: photo ? (mine ? photo : `${import.meta.env.BASE_URL}${photo}`) : null,
        frame:
          own?.player ??
          r.frames?.player ??
          (photo && !mine && !UNCROPPED_PHOTOS.has(photo) ? SQUARE_FRAME : null),
      }
    })
  }, [individual, faces, lang])

  /**
   * The few on the home screen.
   *
   * A landing screen is not a directory. The grid stops being glanceable at
   * about a dozen faces and the roster only grows, so the home screen shows
   * the few named in HOME_RECITERS and "See all" shows every one.
   */
  const homeFaces = useMemo(
    () =>
      // Mapped over the named list rather than filtered by a flag, so the
      // order is the one chosen and a newly added mushaf cannot appear here
      // by simply existing.
      HOME_RECITERS.map((id) => allFaces.find((f) => f.id === id)).filter(
        (f): f is HomeFace => !!f,
      ),
    [allFaces],
  )

  /** How many surahs each mushaf holds, to mark the ones still growing. */
  const surahCounts = useMemo(
    () => Object.fromEntries(individual.map((r) => [r.id, r.surahs.length])),
    [individual],
  )

  /**
   * The two mosques, as cards rather than as chips in a row.
   *
   * Each carries a few of the imams who led there. Two archives of the same
   * shape and a similar count are otherwise told apart by the word alone, and
   * the faces say which mosque this is at a glance.
   */
  const placeCards = useMemo<PlaceCard[]>(() => {
    const roster = allImams()
    const cards: PlaceCard[] = []
    for (const m of PLACES) {
      const years = mosqueYears.get(m.place) ?? []
      if (!years.length) continue
      const led = roster
        .filter((i) => i.serves.includes(m.place))
        .map((i) => ({
          id: i.id,
          label: inScript(lang, i.name, i.nameEn),
          src:
            faces.get(i.id)?.url ??
            (i.photo ? `${import.meta.env.BASE_URL}${i.photo}` : null),
        }))
        .filter((i) => i.src)
        .slice(0, 5)
      cards.push({
        place: m.place,
        label: inScript(lang, m.ar, m.en),
        years: years.length,
        open: yearsOpen === m.place,
        here: openPlace === m.place,
        year: openPlace === m.place ? openYear : null,
        faces: led,
      })
    }
    return cards
  }, [mosqueYears, yearsOpen, openPlace, openYear, faces, lang])

  /**
   * Where the listener stopped.
   *
   * The engine writes the playhead every few seconds, so this is live rather
   * than a snapshot taken at boot. The verse is only named where this
   * recitation is actually timed: deriving one from elapsed seconds would be
   * a confident guess about which ayah of the Quran someone had reached, and
   * the card says how far in instead.
   */
  const homeResume = useMemo<HomeResume | null>(() => {
    if (current === null) return null
    const md = surahMeta.find((m) => m.surah === current)
    if (!md) return null
    // Timings are in milliseconds; the playhead is in seconds.
    const starts = ayahStartsFor(reciterId, current)
    const verse = starts?.length
      ? Math.max(1, starts.filter((ms) => ms <= time * 1000 + 250).length)
      : null
    return {
      surahName: md.name,
      surahNameEn: md.nameEn,
      verse,
      at: formatTime(time, lang),
    }
  }, [current, reciterId, time, lang])

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

  const saveImported = async (items: Array<{ surah: number; file: File }>) => {
    for (const { surah, file } of items) {
      await putAudio(reciterId, surah, file, 'import')
    }
    await refreshDownloaded()
  }

  const changeLang = async (next: Lang) => {
    setLang(next)
    // Mirrored for the next launch's boot script, the way applyTheme does.
    try {
      localStorage.setItem(LANG_KEY, next)
    } catch {
      /* private window; a flash on next launch is the only cost */
    }
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
      // A sheet with a scrim is modal, and Escape is how a modal closes.
      if (e.key === 'Escape' && !playerMin) {
        e.preventDefault()
        closeSheet()
        return
      }
      if (e.code === 'Space' && tag !== 'BUTTON') {
        e.preventDefault()
        void toggle()
        return
      }
      if (current === null) return
      /*
       * Not mirrored. The scrubber is `direction: ltr` in every language —
       * pinned, so a clock reads the way a clock reads — which means the
       * playhead always moves right as it advances. Mirroring these keys made
       * ArrowRight run the recitation backwards in Arabic, and disagreed with
       * the track's own key handler, which never mirrored.
       */
      const back = 'ArrowLeft'
      const forward = 'ArrowRight'
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
  }, [toggle, current, time, t.dir, playerMin, closeSheet])

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
      /*
       * Home takes the slot the library had. The library is not gone — the
       * home screen's reciter section opens it with "See all", which is where
       * someone looking for the whole collection would reach for it anyway.
       */
      { id: 'home', label: t.tabHome, icon: <HomeIcon size={21} />, onSelect: () => setTab('home') },
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
        {/* The home screen carries its own header — logo, wordmark, search —
            so the shared one, which is a player header, stands down there. */}
        {tab !== 'home' && (
        <div className="sheet-head">
          <h1 className="wordmark">
            <span className="wordmark-main">{brandName(lang)}</span>
            <span className="wordmark-alt">
              <span className={isLatinText(brandSecondary(lang)) ? 'trk' : undefined}>
                {brandSecondary(lang)}
              </span>
              <span className="trk-sep" aria-hidden="true">
                ·
              </span>
              <span className={isLatinText(t.appTitle) ? 'trk' : undefined}>
                {t.appTitle}
              </span>
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
          {tab === 'home' && (
            <HomePanel
              t={t}
              lang={lang}
              base={import.meta.env.BASE_URL}
              resume={homeResume}
              faces={homeFaces}
              onResume={() => {
                if (current === null) return
                // Back to exactly where the playhead was left, not to zero.
                requestPlay(reciterId, current, time)
                setTab('quran')
              }}
              onPickReciter={(id) => {
                void switchReciter(id)
                setTab('quran')
              }}
              onSeeAll={() => setTab('library')}
              onSearch={() => {
                setTab('quran')
                // The field only exists once the Quran tab has rendered.
                window.setTimeout(() => searchRef.current?.focus(), 0)
              }}
            />
          )}

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
              playing={playing}
              verified={isVerified}
              rejected={rejected}
              onPlay={startSurah}
              onDownload={startDownload}
            />
          )}

          {tab === 'library' && (
            <div className="panel">
              {/*
                  Everyone the app can play, which is where "See all" lands.

                  A mosque's year picker opens directly under its own card. It
                  used to sit at the top of the sheet, beside the chip that
                  opened it; from here that would have been off screen behind
                  whatever the reader had already scrolled past.
              */}
              <ReciterPanel
                t={t}
                lang={lang}
                faces={allFaces}
                activeId={reciterId}
                counts={surahCounts}
                places={placeCards}
                onPick={(id) => {
                  setYearsOpen(null)
                  void switchReciter(id)
                  setTab('quran')
                }}
                onTogglePlace={(place) =>
                  setYearsOpen(yearsOpen === place ? null : (place as Place))
                }
              />

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
                              {/*
                                  Faces, not a truncated list of names.

                                  Every row printed the same line — six consecutive
                                  years all read "Abdullah Al-Juhany · Maher…"
                                  because the roster changes at the end, which is
                                  exactly where the ellipsis fell. The line meant
                                  to tell the years apart told them apart least.
                                  A row of portraits is scannable in one glance and
                                  differs between years where the roster differs.
                              */}
                              {led.length > 0 && (
                                <span className="year-faces">
                                  {led.slice(0, 7).map((i) => (
                                    <span
                                      key={i.id}
                                      className="year-face"
                                      title={inScript(lang, i.name, i.nameEn)}
                                      style={
                                        faces.get(i.id)?.url || i.photo
                                          ? {
                                              ['--face-src' as string]: `url('${
                                                faces.get(i.id)?.url ??
                                                `${import.meta.env.BASE_URL}${i.photo}`
                                              }')`,
                                            }
                                          : undefined
                                      }
                                    />
                                  ))}
                                  {led.length > 7 && (
                                    <span className="year-more">
                                      +{digits(lang, led.length - 7)}
                                    </span>
                                  )}
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

              <FavouritesPanel
                t={t}
                lang={lang}
                favourites={favourites}
                reciters={reciters}
                surahMeta={surahMeta}
                onPlay={(id, surah) => {
                  requestPlay(id, surah)
                  setTab('quran')
                }}
                onRemove={(key) => {
                  const next = favourites.filter((k) => k !== key)
                  setFavourites(next)
                  void setPref('favourites', next)
                }}
              />

              <ImamPanel
                t={t}
                lang={lang}
                surahMeta={surahMeta}
                faces={faces}
                onPlay={(id, surah, at) => {
                  requestPlay(id, surah, at)
                  setTab('quran')
                }}
                onOpenYear={(id) => {
                  void switchReciter(id)
                  setTab('quran')
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

              {/*
                  The photograph on the home screen's continue card.
                  CC BY 2.5 obliges attribution, and this is where the app
                  already credits where its material came from.
              */}
              <p className="credit">
                <a
                  href="https://commons.wikimedia.org/wiki/File:Quran-Mus%27haf_Al_Tajweed.jpg"
                  target="_blank"
                  rel="noreferrer"
                >
                  Quran-Mus’haf Al Tajweed
                </a>{' '}
                — Amr Fayez (TheEgyptian), Wikimedia Commons,{' '}
                <a
                  href="https://creativecommons.org/licenses/by/2.5"
                  target="_blank"
                  rel="noreferrer"
                >
                  CC BY 2.5
                </a>
              </p>

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

            </div>
          )}
        </div>
      </div>

      {currentView && reciter && (!playerMin || leaving) && (
        <div
          className={`sheet-scrim${leaving ? ' is-leaving' : ''}`}
          onClick={closeSheet}
        />
      )}

      {currentView && reciter && (!playerMin || leaving) && (
        <div
          className={`player${leaving ? ' is-leaving' : ''}`}
          role="dialog"
          aria-modal="true"
          aria-label={t.openPlayer}
          /*
           * Committing on the animation rather than on a timer, so the two
           * cannot drift apart. Guarded by name because a child's own entrance
           * bubbles up here too, and an unguarded handler would let the
           * contents landing close the sheet they just landed on.
           */
          onAnimationEnd={(e) => {
            if (e.animationName === 'sheet-down') {
              setPlayerMin(true)
              setLeaving(false)
            }
          }}
        >
          {/* The grabber. Folding the player away is the difference between
              seeing four surahs and seeing ten, so it is a full-width target
              rather than a small chevron in a corner. */}
          <button
            className="player-handle"
            aria-expanded={!playerMin}
            aria-label={playerMin ? t.expandPlayer : t.collapsePlayer}
            onClick={closeSheet}
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

            {/*
                Two lines, not six.

                This used to be the surah name, the literal word "Reciter", an
                Arabic collection title, an English one, a riwayah, and a
                bordered pill that wrapped inside itself — six centred lines of
                differing length, ragged on both edges. At night, one-handed,
                with a mushaf open, the sheet answers two questions: what is
                playing, and who is reciting it. Everything else on it is a
                setting, and settings have their own screen.

                The second line is still the control: the name is what a
                listener is already looking at, so stepping to the next reciter
                belongs on it rather than behind an unlabelled icon.
            */}
            <div className="now">
              <div className="surah-name" lang="ar">
                سُورَةُ {currentView.name}
              </div>

              <button
                type="button"
                className="now-line"
                disabled={nextVoice === null}
                aria-label={nextVoice === null ? undefined : t.nextReciter}
                onClick={() => {
                  if (!nextVoice) return
                  if (nextVoice.kind === 'within') engine.current!.seek(nextVoice.at)
                  else void playSurah(nextVoice.surah)
                }}
              >
                <span className="now-who">
                  {liveWho
                    ? inScript(lang, liveWho.name, liveWho.nameEn)
                    : (voiceLabel(currentView, lang) ??
                      inScript(lang, reciter.name, reciter.nameEn))}
                </span>
                {/* The collection only when it is not simply the name again:
                    an individual mushaf is titled after the man reciting it. */}
                {collectionLabel && (
                  <>
                    <span className="now-dot" aria-hidden="true">
                      ·
                    </span>
                    <span className="now-coll">{collectionLabel}</span>
                  </>
                )}
                {/*
                    Which of his mushafs this is, for the sheikhs who have more
                    than one here — carried only on those, so this line stays
                    two items long for everyone else.

                    The riwayah wins where there is one. Al-Juhany's Ad-Duri is
                    tagged "Ad-Duri" for a grid cell that has room for nothing
                    longer, and printing that beside "Ad-Duri from Abu Amr
                    al-Basri" would say the same word twice.
                */}
                {riwayahLabel(reciter, lang) ? (
                  <span className="now-riwayah">({riwayahLabel(reciter, lang)})</span>
                ) : (
                  reciter.tag && (
                    <span className="now-riwayah">
                      ({inScript(lang, reciter.tag, reciter.tagEn ?? reciter.tag)})
                    </span>
                  )
                )}
                {nextVoice !== null && (
                  <span className="now-next" aria-hidden="true">
                    <NextVoice size={15} />
                  </span>
                )}
              </button>
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
              <div
                className="fill"
                style={{ ['--pct' as string]: pct / 100 }}
              />
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
          setLeaving(false)
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
