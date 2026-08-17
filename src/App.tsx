import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadCatalog } from './catalog/load'
import type { SurahView } from './catalog/types'
import { effectiveVerified, getVerdicts, type Verdict } from './catalog/verification'
import { listDownloaded, putAudio, deleteAudio } from './db/audio'
import { loadPosition, getPref, setPref } from './db/prefs'
import { DownloadQueue } from './download/queue'
import { CatalogSource } from './sources/CatalogSource'
import { PlayerEngine, type PlaybackMode } from './player/engine'
import { updateMediaSession } from './player/mediaSession'
import { nextSurah, prevSurah, type RepeatMode } from './player/playQueue'
import { getQuota, requestPersistence, canDownloadAll } from './storage/quota'
import { SurahList, plainName } from './ui/SurahList'
import { formatBytes, formatTime } from './ui/format'
import {
  Shuffle, Repeat, RepeatOne, Search, Play, Pause, Back, Forward,
  Moon, Star, Library, QuranMark, More, Broadcast,
} from './ui/Icons'
import './ui/theme.css'

type Tab = 'quran' | 'library' | 'text' | 'more'
const SPEEDS = [1, 1.25, 1.5, 0.75]

export default function App() {
  const [surahs, setSurahs] = useState<SurahView[]>([])
  const [downloaded, setDownloaded] = useState<Set<number>>(new Set())
  const [progress, setProgress] = useState<Record<number, number>>({})
  const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({})
  const [favourites, setFavourites] = useState<number[]>([])
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

  const urls = useMemo(
    () => new Map(surahs.filter((s) => s.url).map((s) => [s.surah, s.url!])),
    [surahs],
  )

  const queue = useRef<DownloadQueue | null>(null)
  if (!queue.current) {
    queue.current = new DownloadQueue({
      fetcher: (surah, url, onProgress, signal) =>
        new CatalogSource(urls).fetchSurah(surah, onProgress, signal),
      save: async (surah, blob) => {
        await putAudio(surah, blob, 'catalog')
      },
    })
  }

  const refreshDownloaded = useCallback(async () => {
    const list = await listDownloaded()
    setDownloaded(new Set(list.map((l) => l.surah)))
    setQuota(await getQuota())
  }, [])

  useEffect(() => {
    engine.current!.onError = (m) => setError(m)
    void (async () => {
      setSurahs(await loadCatalog())
      setVerdicts(await getVerdicts())
      setFavourites(await getPref<number[]>('favourites', []))
      await refreshDownloaded()
      await requestPersistence()
      const pos = await loadPosition()
      if (pos) setCurrent(pos.surah)
    })()
  }, [refreshDownloaded])

  useEffect(() => {
    return queue.current!.subscribe((s) => {
      setProgress(s.progress)
      const failed = Object.values(s.failed)[0]
      if (failed) setError(`Download failed: ${failed}`)
      if (!s.active.length && !s.pending.length) void refreshDownloaded()
    })
  }, [refreshDownloaded])

  useEffect(() => {
    const el = engine.current!.el
    const onTime = () => setTime(el.currentTime)
    const onMeta = () => setDuration(el.duration || 0)
    const onPlay = () => { setPlaying(true); setError(null) }
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

  const playable = useMemo(
    () => surahs.filter((s) => s.released).map((s) => s.surah),
    [surahs],
  )

  const playSurah = useCallback(
    async (surah: number, startAt = 0) => {
      const s = surahs.find((x) => x.surah === surah)
      if (!s?.released) return
      setBusy(true)
      setError(null)
      setCurrent(surah)

      const res = await engine.current!.load(surah, s.url, s.fallbackUrl, startAt)
      setBusy(false)
      if (!res.ok) {
        setError(`${plainName(s.name)}: ${res.reason}`)
        return
      }
      setMode(res.mode)
      engine.current!.setRate(SPEEDS[speedIdx])
      await engine.current!.play()

      updateMediaSession(s, {
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
    [surahs, playable, speedIdx],
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

  const advanceRef = useRef<typeof advance | null>(null)
  advanceRef.current = advance

  useEffect(() => {
    const el = engine.current!.el
    const onEnded = () => void advance()
    el.addEventListener('ended', onEnded)
    return () => el.removeEventListener('ended', onEnded)
  }, [advance])

  // sleep timer
  useEffect(() => {
    if (sleepAt === null) return
    const id = setTimeout(() => {
      engine.current!.pause()
      setSleepAt(null)
    }, sleepAt * 60_000)
    return () => clearTimeout(id)
  }, [sleepAt])

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

  const toggleFavourite = async () => {
    if (current === null) return
    const next = favourites.includes(current)
      ? favourites.filter((n) => n !== current)
      : [...favourites, current]
    setFavourites(next)
    await setPref('favourites', next)
  }

  const seekTo = (e: React.MouseEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect()
    // RTL track: progress grows from the right edge.
    const f = (r.right - e.clientX) / r.width
    engine.current!.seek(Math.max(0, Math.min(1, f)) * duration)
  }

  const pct = duration ? (time / duration) * 100 : 0

  return (
    <div className="app">
      <div className="sheet">
        <div className="sheet-head">
          <h1>القرآن الكريم</h1>
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
              downloaded={downloaded}
              progress={progress}
              current={current}
              verified={(s) => effectiveVerified(s, verdicts)}
              onPlay={(n) => void playSurah(n)}
              onDownload={(n) => {
                const u = urls.get(n)
                if (u) queue.current!.enqueue(n, u)
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
                {formatBytes(quota.usage)} مستخدَمة من {formatBytes(quota.quota)} · محفوظة:{' '}
                {downloaded.size} سورة
              </p>
              <p>حفظ كل السور المسجَّلة يحتاج {formatBytes(releasedTotal)}.</p>
              <button
                className="btn solid"
                disabled={!canDownloadAll(releasedTotal, quota.free)}
                onClick={() => {
                  for (const [n, u] of urls) queue.current!.enqueue(n, u)
                }}
              >
                حفظ الكل · {formatBytes(releasedTotal)}
              </button>
              <button
                className="btn"
                disabled={!downloaded.size}
                onClick={async () => {
                  for (const n of downloaded) await deleteAudio(n)
                  await refreshDownloaded()
                }}
              >
                حذف المحفوظ
              </button>
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
              <h2>المزيد</h2>
              <p>
                المصحف المرتل للشيخ ياسر بن راشد الدوسري، إنتاج المركز السعودي للتلاوات
                القرآنية والأحاديث النبوية.
              </p>
              <p>
                مُسجَّل حتى الآن: {playable.length} من 114 سورة. تُضاف السور الجديدة تلقائيًا
                عند نشرها.
              </p>
              <p>
                بحاجة إلى تأكيد بالسماع:{' '}
                {surahs.filter((s) => s.released && !effectiveVerified(s, verdicts)).length}{' '}
                سورة.
              </p>
            </div>
          )}
        </div>
      </div>

      {currentView && (
        <div className="player">
          <div className="player-top">
            <div className="medallion" aria-hidden="true">
              <QuranMark size={34} />
            </div>

            <div className="now">
              <div className="surah-name">سُورَةُ {currentView.name}</div>
              <div className="label">القارئ</div>
              <div className="reciter-ar">أ.د. ياسر الدوسري</div>
              <div className="reciter-en">Yasser Al-Dosari</div>
            </div>

            <button
              className="round"
              aria-label="المفضلة"
              aria-pressed={favourites.includes(currentView.surah)}
              onClick={toggleFavourite}
            >
              <Star size={20} filled={favourites.includes(currentView.surah)} />
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

            <button className="ctrl big" aria-label={playing ? 'إيقاف' : 'تشغيل'} onClick={toggle}>
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
            <div className="track" onClick={seekTo}>
              <div className="fill" style={{ width: `${pct}%` }} />
              <div className="knob" style={{ right: `${pct}%` }} />
            </div>
            <div className="times">
              <span>{formatTime(time)}</span>
              <span>
                {mode === 'offline' ? 'محفوظة' : 'بث'}
                {sleepAt ? ` · ${sleepAt}د` : ''}
              </span>
              <span>-{formatTime(Math.max(0, duration - time))}</span>
            </div>
          </div>

          {error && (
            <p className="empty" style={{ padding: '0 0 0.6rem', color: 'var(--warn)' }}>
              {error}
            </p>
          )}
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
