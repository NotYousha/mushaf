import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { loadCatalog } from './catalog/load'
import type { SurahView } from './catalog/types'
import {
  effectiveVerified,
  getVerdicts,
  setVerdict,
  type Verdict,
} from './catalog/verification'
import { listDownloaded, putAudio, deleteAudio } from './db/audio'
import { loadPosition } from './db/prefs'
import { DownloadQueue } from './download/queue'
import { CatalogSource } from './sources/CatalogSource'
import { PlayerEngine, type PlaybackMode } from './player/engine'
import { updateMediaSession } from './player/mediaSession'
import { nextSurah, prevSurah, type RepeatMode } from './player/playQueue'
import { getQuota, requestPersistence, canDownloadAll } from './storage/quota'
import { SurahList } from './ui/SurahList'
import { Waveform } from './ui/Waveform'
import { formatBytes, formatTime } from './ui/format'
import './ui/theme.css'

type Tab = 'surahs' | 'text' | 'storage'

export default function App() {
  const [surahs, setSurahs] = useState<SurahView[]>([])
  const [downloaded, setDownloaded] = useState<Set<number>>(new Set())
  const [progress, setProgress] = useState<Record<number, number>>({})
  const [verdicts, setVerdicts] = useState<Record<number, Verdict>>({})
  const [current, setCurrent] = useState<number | null>(null)
  const [playing, setPlaying] = useState(false)
  const [mode, setMode] = useState<PlaybackMode>('streaming')
  const [time, setTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [repeat, setRepeat] = useState<RepeatMode>('off')
  const [tab, setTab] = useState<Tab>('surahs')
  const [quota, setQuota] = useState({ usage: 0, quota: 0, free: 0 })
  const [text, setText] = useState<Record<string, string[]> | null>(null)

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
    void (async () => {
      setSurahs(await loadCatalog())
      setVerdicts(await getVerdicts())
      await refreshDownloaded()
      await requestPersistence()
      const pos = await loadPosition()
      if (pos) setCurrent(pos.surah)
    })()
  }, [refreshDownloaded])

  useEffect(() => {
    const q = queue.current!
    return q.subscribe((s) => {
      setProgress(s.progress)
      if (!s.active.length && !s.pending.length) void refreshDownloaded()
    })
  }, [refreshDownloaded])

  useEffect(() => {
    const el = engine.current!.el
    const onTime = () => setTime(el.currentTime)
    const onMeta = () => setDuration(el.duration || 0)
    const onPlay = () => setPlaying(true)
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

  const playSurah = useCallback(
    async (surah: number, startAt = 0) => {
      const s = surahs.find((x) => x.surah === surah)
      if (!s?.released) return
      const m = await engine.current!.load(surah, s.url, startAt)
      if (!m) return
      setMode(m)
      setCurrent(surah)
      await engine.current!.play().catch(() => {})
      updateMediaSession(s, {
        play: () => void engine.current!.play(),
        pause: () => engine.current!.pause(),
        next: () => void advance(),
        prev: () => {
          const p = prevSurah(surah, playable)
          if (p) void playSurah(p)
        },
        seek: (t) => engine.current!.seek(t),
      })
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [surahs, downloaded, repeat],
  )

  // Continuous play walks every released surah — downloaded ones play offline,
  // the rest stream.
  const playable = useMemo(
    () => surahs.filter((s) => s.released).map((s) => s.surah),
    [surahs],
  )

  const advance = useCallback(async () => {
    if (current === null) return
    const n = nextSurah(current, repeat, playable)
    if (n !== null) await playSurah(n)
  }, [current, repeat, playable, playSurah])

  useEffect(() => {
    const el = engine.current!.el
    const onEnded = () => void advance()
    el.addEventListener('ended', onEnded)
    return () => el.removeEventListener('ended', onEnded)
  }, [advance])

  const toggle = async () => {
    if (current === null) {
      if (playable.length) await playSurah(playable[0])
      return
    }
    if (playing) engine.current!.pause()
    else if (engine.current!.surah === current) await engine.current!.play().catch(() => {})
    else await playSurah(current)
  }

  const currentView = surahs.find((s) => s.surah === current) ?? null
  const releasedTotal = surahs.filter((s) => s.released).reduce((a, s) => a + s.bytes, 0)

  const openText = async () => {
    setTab('text')
    if (!text) {
      // Loaded on demand so the initial app payload stays small.
      const mod = await import('../data/quran-text.json')
      setText(mod.default as unknown as Record<string, string[]>)
    }
  }

  return (
    <div className="app">
      <div className="band" />

      <header className="masthead">
        <h1>المصحف المرتل</h1>
        <p className="reciter">أ. د. ياسر بن راشد الدوسري</p>
        <p className="sub">
          {surahs.filter((s) => s.released).length} of 114 recorded ·{' '}
          {downloaded.size} saved offline
        </p>
        <div className="ornament" />
      </header>

      <nav className="tabs" role="tablist">
        <button role="tab" aria-selected={tab === 'surahs'} onClick={() => setTab('surahs')}>
          Surahs
        </button>
        <button role="tab" aria-selected={tab === 'text'} onClick={openText}>
          Text
        </button>
        <button role="tab" aria-selected={tab === 'storage'} onClick={() => setTab('storage')}>
          Storage
        </button>
      </nav>

      <main>
        {tab === 'surahs' && (
          <SurahList
            surahs={surahs}
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

        {tab === 'text' && (
          <div className="panel">
            <h2>{currentView ? currentView.name : 'الفاتحة'}</h2>
            <p>
              {currentView
                ? `${currentView.nameEn} — ${currentView.translation}`
                : 'Pick a surah to read along.'}
            </p>
            {!text && <p>Loading text…</p>}
            {text && (
              <div className="ayah">
                {(text[String(current ?? 1)] ?? []).map((a, i) => (
                  <span key={i}>
                    {a}
                    <span className="ayah-num">﴿{i + 1}﴾</span>{' '}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {tab === 'storage' && (
          <div className="panel">
            <h2>Storage</h2>
            <p>
              Surahs stream over the network by default, so nothing is stored until you
              choose to save it. Saved surahs play with no signal.
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
              {formatBytes(quota.usage)} used of {formatBytes(quota.quota)} available ·{' '}
              {downloaded.size} surahs saved
            </p>
            <p>
              Saving all {surahs.filter((s) => s.released).length} recorded surahs needs{' '}
              {formatBytes(releasedTotal)}.
            </p>
            <button
              className="btn solid"
              disabled={!canDownloadAll(releasedTotal, quota.free)}
              onClick={() => {
                for (const [n, u] of urls) queue.current!.enqueue(n, u)
              }}
            >
              {canDownloadAll(releasedTotal, quota.free)
                ? `Save all · ${formatBytes(releasedTotal)}`
                : 'Not enough space to save all'}
            </button>{' '}
            <button
              className="btn"
              onClick={async () => {
                for (const n of downloaded) await deleteAudio(n)
                await refreshDownloaded()
              }}
              disabled={!downloaded.size}
            >
              Remove saved audio
            </button>
          </div>
        )}
      </main>

      {currentView && (
        <div className="dock">
          <div className="dock-inner">
            <div>
              <div className="now">{currentView.name}</div>
              <div className="time">
                {formatTime(time)} / {formatTime(duration)} ·{' '}
                {mode === 'offline' ? 'offline' : 'streaming'}
              </div>
              <Waveform
                progress={duration ? time / duration : 0}
                seed={currentView.surah}
                onSeek={(f) => engine.current!.seek(f * duration)}
              />
            </div>
            <div className="controls">
              <button
                className="icon"
                aria-label="Repeat mode"
                onClick={() =>
                  setRepeat(repeat === 'off' ? 'all' : repeat === 'all' ? 'one' : 'off')
                }
              >
                {repeat === 'one' ? '1' : repeat === 'all' ? '∞' : '→'}
              </button>
              <button className="icon primary" aria-label={playing ? 'Pause' : 'Play'} onClick={toggle}>
                {playing ? '❚❚' : '▶'}
              </button>
              <button className="icon" aria-label="Next surah" onClick={() => void advance()}>
                ›
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="band" />
    </div>
  )
}
