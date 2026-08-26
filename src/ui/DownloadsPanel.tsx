import { useState } from 'react'
import type { Strings, Lang } from '../i18n'
import { inScript, digits } from '../i18n/script'
import { formatBytes } from './format'
import type { Reciter, SurahMeta } from '../catalog/types'
import { Chevron } from './Icons'

/** One saved surah, as the downloads list needs it. */
export type SavedRow = {
  reciterId: string
  surah: number
  bytes: number
  partial?: boolean
}

type Props = {
  t: Strings
  lang: Lang
  rows: SavedRow[]
  reciters: Reciter[]
  surahMeta: SurahMeta[]
  /** Given `reciterId:surah` keys, remove exactly those. */
  onDelete: (keys: string[]) => Promise<void>
}

const keyOf = (r: SavedRow) => `${r.reciterId}:${r.surah}`

/**
 * What is on the device, and the only way to get it off again.
 *
 * The app could download a 2.9 GB mushaf and had nowhere to delete one: the
 * storage section above this counted what was saved and offered no way to
 * reclaim it, so the only remedy was clearing the browser's data for the whole
 * app, which takes every other reciter and every preference with it.
 *
 * Grouped by reciter because that is the unit people think in — "I have
 * finished with Al-Afasy" — and because a flat list of six hundred saved
 * surahs is not a thing anyone can act on. Sorted by size, largest first, so
 * the row that would free the most space is the one at the top.
 */
export function DownloadsPanel({ t, lang, rows, reciters, surahMeta, onDelete }: Props) {
  const [open, setOpen] = useState<string | null>(null)
  const [picking, setPicking] = useState<string | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [busy, setBusy] = useState(false)

  if (!rows.length) return <p className="dl-empty">{t.storageEmpty}</p>

  const byReciter = new Map<string, SavedRow[]>()
  for (const r of rows) {
    const list = byReciter.get(r.reciterId) ?? []
    list.push(r)
    byReciter.set(r.reciterId, list)
  }

  const groups = [...byReciter.entries()]
    .map(([id, list]) => {
      const who = reciters.find((r) => r.id === id)
      return {
        id,
        // An id with no catalog entry is still shown: audio saved under a
        // reciter who has since been removed is exactly what someone needs to
        // be able to delete, and hiding it would strand the bytes.
        label: who ? inScript(lang, who.name, who.nameEn) : id,
        rows: [...list].sort((a, b) => a.surah - b.surah),
        bytes: list.reduce((a, x) => a + x.bytes, 0),
      }
    })
    .sort((a, b) => b.bytes - a.bytes)

  const run = async (keys: string[]) => {
    if (!keys.length) return
    setBusy(true)
    try {
      await onDelete(keys)
    } finally {
      setBusy(false)
      setPicked(new Set())
      setPicking(null)
    }
  }

  return (
    <div className="dl-list">
      {groups.map((g) => {
        const isOpen = open === g.id
        const isPicking = picking === g.id
        const chosen = g.rows.filter((r) => picked.has(keyOf(r)))
        return (
          <div className="dl-group" key={g.id}>
            <div className="dl-head">
              <button
                type="button"
                className="dl-title"
                aria-expanded={isOpen}
                onClick={() => {
                  setOpen(isOpen ? null : g.id)
                  if (isOpen) setPicking(null)
                }}
              >
                <span className={`dl-caret${isOpen ? ' is-open' : ''}`} aria-hidden="true">
                  <Chevron size={18} />
                </span>
                <span className="dl-name">{g.label}</span>
                <span className="dl-meta">
                  {digits(lang, g.rows.length)} {t.storageSurahs} · {formatBytes(g.bytes, lang)}
                </span>
              </button>

              <button
                type="button"
                className="dl-del"
                disabled={busy}
                onClick={() => {
                  if (!window.confirm(t.storageConfirmReciter)) return
                  void run(g.rows.map(keyOf))
                }}
              >
                {t.storageDeleteAll}
              </button>
            </div>

            {isOpen && (
              <>
                <div className="dl-tools">
                  <button
                    type="button"
                    className="dl-link"
                    disabled={busy}
                    onClick={() => {
                      setPicking(isPicking ? null : g.id)
                      setPicked(new Set())
                    }}
                  >
                    {isPicking ? t.storageCancel : t.storageSelect}
                  </button>
                  {isPicking && (
                    <button
                      type="button"
                      className="dl-del"
                      disabled={busy || !chosen.length}
                      onClick={() => void run(chosen.map(keyOf))}
                    >
                      {t.storageDeleteSelected}
                      {chosen.length > 0 && ` (${digits(lang, chosen.length)})`}
                    </button>
                  )}
                </div>

                <ul className="dl-surahs">
                  {g.rows.map((r) => {
                    const meta = surahMeta.find((m) => m.surah === r.surah)
                    const k = keyOf(r)
                    return (
                      <li key={k} className="dl-row">
                        {isPicking ? (
                          <label className="dl-pick">
                            <input
                              type="checkbox"
                              checked={picked.has(k)}
                              onChange={(e) => {
                                const next = new Set(picked)
                                if (e.currentTarget.checked) next.add(k)
                                else next.delete(k)
                                setPicked(next)
                              }}
                            />
                            <span className="dl-surah">
                              {digits(lang, r.surah)}.{' '}
                              {meta ? inScript(lang, meta.name, meta.nameEn) : r.surah}
                            </span>
                          </label>
                        ) : (
                          <span className="dl-surah">
                            {digits(lang, r.surah)}.{' '}
                            {meta ? inScript(lang, meta.name, meta.nameEn) : r.surah}
                          </span>
                        )}

                        <span className="dl-size">
                          {formatBytes(r.bytes, lang)}
                          {r.partial && ` · ${t.storagePartial}`}
                        </span>

                        {!isPicking && (
                          <button
                            type="button"
                            className="dl-x"
                            aria-label={t.storageDelete}
                            disabled={busy}
                            onClick={() => {
                              if (!window.confirm(t.storageConfirmOne)) return
                              void run([k])
                            }}
                          >
                            ×
                          </button>
                        )}
                      </li>
                    )
                  })}
                </ul>
              </>
            )}
          </div>
        )
      })}

      {/* Said once, at the bottom, because it is the thing people are most
          surprised by: this storage belongs to the browser, not to the app. */}
      <p className="dl-note">{t.storageKept}</p>
    </div>
  )
}
