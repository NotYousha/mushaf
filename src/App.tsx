import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadCatalog, buildView, surahMeta } from './catalog/load'
import type { Reciter } from './catalog/types'
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
import { DownloadQueue } from './download/queue'
import { CatalogSource } from './sources/CatalogSource'
import { PlayerEngine, type PlaybackMode } from './player/engine'
import { updateMediaSession } from './player/mediaSession'
import { nextSurah, prevSurah, type RepeatMode } from './player/playQueue'
import { getQuota, requestPersistence, canDownloadAll } from './storage/quota'
import { SurahList, plainName } from './ui/SurahList'
import { VerifyPanel } from './ui/VerifyPanel'
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
  Library,
  QuranMark,
  More,
  Broadcast,
} from './ui/Icons'
import './ui/theme.css'

type Tab = 'quran' | 'library' | 'text' | 'more'
const SPEEDS = [1, 1.25, 1.5, 0.75]

const dlKey = (reciterId: string, surah: number) => `${reciterId}:${surah}`

export default function App() {
  const [reciters, setReciters] = useState<Reciter[]>([])
  const [reciterId, setReciterId] = useState('dosari')
  const [downloaded, setDownloaded] = useState<Set<string>>(new Set())
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
  const [text, setText] = useState<Record<string, string[]> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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
        new CatalogSource(new Map([[job.surah, job.url]])).fetchSurah(
          job.surah,
          onProgress,
          signal,
        ),
      save: async (job, blob) => {
        await putAudio(job.reciterId, job.surah, blob, 'catalog')
      },
    })
  }

  const refreshDownloaded = useCallback(async () => {
    const list = await listDownloaded()
    setDownloaded(new Set(list.map((l) => dlKey(l.reciterId, l.surah))))
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
      await requestPersistence()
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
      const failed = Object.values(s.failed)[0]
      if (failed) setError(`تعذّر الحفظ: ${failed}`)
      if (!s.active.length && !s.pending.length) void refreshDownloaded()
    })
  }, [refreshDownloaded])

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

      updateMediaSession(s, reciter.fullName, {
        play: () => void engine.current!.play(),
        pause: () => engine.current!.pause(),
        next: () => void advanceRef.current?.(),
        prev: () => {
          const p = prevSurah(surah, playable)
          if (p) void playSurah(p)
        },
        seek: (t) => engine.current!.seek(t),
      })
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

  useEffect(() => {
    const el = engine.current!.el
    const onEnded = () => void advance()
    el.addEventListener('ended', onEnded)
    return () => el.removeEventListener('ended', onEnded)
  }, [advance])

  useEffect(() => {
    if (sleepAt === null) return
    const id = setTimeout(
      () => {
        engine.current!.pause()
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

  const openText = async () => {
    setTab('text')
    if (!text) {
      const mod = await import('../data/quran-text.json')
      setText(mod.default as unknown as Record<string, string[]>)
    }
  }

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

  const pct = duration ? (time / duration) * 100 : 0

  return (
    <div className="app">
      <div className="sheet">
        <div className="sheet-head">
          <h1>المُتابَعة</h1>
          <div className="head-actions">
            <button
              className="round"
              aria-pressed={shuffle}
              aria-label="ترتيب عشوائي"
              onClick={() => setShuffle(!shuffle)}
            >
              <Shuffle size={20} />
            </button>
            <button
              className="round"
              aria-pressed={repeat !== 'off'}
              aria-label="تكرار"
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
                onClick={() => void switchReciter(r.id)}
              >
                <span className="chip-name">{r.name}</span>
                <span className="chip-meta">{r.surahs.length}/114</span>
              </button>
            ))}
          </div>
        )}

        {tab === 'quran' && (
          <div className="search">
            <Search size={20} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="البحث في السور"
              aria-label="البحث في السور"
            />
          </div>
        )}

        <div className="scroll">
          {tab === 'quran' && (
            <SurahList
              surahs={filtered}
              reciterId={reciterId}
              downloaded={downloadedHere}
              progress={progress}
              current={current}
              verified={(s) => effectiveVerified(reciterId, s, verdicts)}
              rejected={rejected}
              onPlay={(n) => void playSurah(n)}
              onDownload={(n) => {
                const u = urls.get(n)
                if (u) queue.current!.enqueue({ reciterId, surah: n, url: u })
              }}
            />
          )}

          {tab === 'library' && (
            <div className="panel">
              <h2>المكتبة</h2>
              <p>
                تُشغَّل السور مباشرةً عبر الإنترنت، ولا يُحفَظ شيء على جهازك إلا إذا اخترت
                ذلك. السور المحفوظة تعمل بدون اتصال.
              </p>
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
                {formatBytes(quota.usage)} مستخدَمة من {formatBytes(quota.quota)} · محفوظة
                لهذا القارئ: {downloadedHere.size} سورة
              </p>
              <p>
                حفظ كل سور {reciter?.name} يحتاج {formatBytes(releasedTotal)}.
              </p>
              <button
                className="btn solid"
                disabled={!canDownloadAll(releasedTotal, quota.free)}
                onClick={() => {
                  for (const [n, u] of urls) {
                    queue.current!.enqueue({ reciterId, surah: n, url: u })
                  }
                }}
              >
                حفظ الكل · {formatBytes(releasedTotal)}
              </button>
              <button
                className="btn"
                disabled={!downloadedHere.size}
                onClick={async () => {
                  for (const n of downloadedHere) await deleteAudio(reciterId, n)
                  await refreshDownloaded()
                }}
              >
                حذف المحفوظ
              </button>

              {reciter && (
                <ImportPanel
                  reciterName={reciter.name}
                  meta={surahMeta}
                  onSave={saveImported}
                />
              )}
            </div>
          )}

          {tab === 'text' && (
            <div className="panel">
              <h2>{currentView ? `سُورَةُ ${currentView.name}` : 'النص'}</h2>
              {!currentView && <p>اختر سورة لعرض نصها.</p>}
              {!text && currentView && <p>جارٍ التحميل…</p>}
              {text && currentView && (
                <div className="ayah">
                  {(text[String(currentView.surah)] ?? []).map((a, i) => (
                    <span key={i}>
                      {a}
                      <span className="ayah-num">﴿{i + 1}﴾</span>{' '}
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'more' && (
            <div className="panel">
              <h2>القُرّاء</h2>
              {reciters.map((r) => (
                <p key={r.id}>
                  <strong>{r.fullName}</strong>
                  <br />
                  {r.mushaf}
                  <br />
                  مُسجَّل: {r.surahs.length} من 114
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
                onVerdict={(surah, v) => void recordVerdict(surah, v)}
              />
            </div>
          )}
        </div>
      </div>

      {currentView && reciter && (
        <div className="player">
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
              <div className="label">القارئ</div>
              <div className="reciter-ar">{reciter.fullName}</div>
              <div className="reciter-en">{reciter.nameEn}</div>
            </div>

            <button
              className="round"
              aria-label="المفضلة"
              aria-pressed={favourites.includes(favKey)}
              onClick={toggleFavourite}
            >
              <Star size={20} filled={favourites.includes(favKey)} />
            </button>
          </div>

          <div className="controls">
            <button
              className="ctrl"
              aria-label="سرعة التشغيل"
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
              aria-label="السابق"
              onClick={() => {
                const p = prevSurah(currentView.surah, playable)
                if (p) void playSurah(p)
              }}
            >
              <Back size={26} />
            </button>

            <button
              className="ctrl big"
              aria-label={playing ? 'إيقاف' : 'تشغيل'}
              onClick={toggle}
            >
              {busy ? '…' : playing ? <Pause size={26} /> : <Play size={26} />}
            </button>

            <button className="ctrl" aria-label="التالي" onClick={() => void advance()}>
              <Forward size={26} />
            </button>

            <button
              className="ctrl"
              aria-label="مؤقت النوم"
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
              aria-label="موضع التشغيل"
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
            <div className="times">
              <span>{formatTime(time)}</span>
              <span className="badge">
                {mode === 'offline' ? 'محفوظة' : 'بث'}
                {sleepAt ? ` · ${sleepAt}د` : ''}
              </span>
              <span>-{formatTime(Math.max(0, duration - time))}</span>
            </div>
          </div>

          {error && <p className="err">{error}</p>}
        </div>
      )}

      <nav className="tabbar" role="tablist">
        <button
          className="tab"
          role="tab"
          aria-selected={tab === 'library'}
          onClick={() => setTab('library')}
        >
          <Library size={23} />
          المكتبة
        </button>
        <button
          className="tab"
          role="tab"
          aria-selected={tab === 'quran'}
          onClick={() => setTab('quran')}
        >
          <QuranMark size={23} />
          القرآن
        </button>
        <button className="tab" role="tab" aria-selected={tab === 'text'} onClick={openText}>
          <Broadcast size={23} />
          النص
        </button>
        <button
          className="tab"
          role="tab"
          aria-selected={tab === 'more'}
          onClick={() => setTab('more')}
        >
          <More size={23} />
          المزيد
        </button>
      </nav>
    </div>
  )
}
