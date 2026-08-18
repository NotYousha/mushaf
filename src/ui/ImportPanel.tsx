import { useMemo, useRef, useState } from 'react'
import { importFiles } from '../sources/ImportSource'
import type { SurahMeta } from '../catalog/types'
import { formatBytes } from './format'
import { plainName } from './SurahList'

type Pending = { file: File; surah: number | null }

type Props = {
  reciterId: string
  reciterName: string
  meta: SurahMeta[]
  onSave: (items: Array<{ surah: number; file: File }>) => Promise<void>
}

/**
 * Add audio from the device.
 *
 * The point of this is independence from any host: a recitation that exists
 * only as files you already have still plays, and it fills surahs the catalog
 * has not published. Filenames are matched to surah numbers where they can be
 * read confidently; anything ambiguous is left for manual assignment rather
 * than guessed at, since filing a recitation under the wrong surah is the
 * worst mistake this app could make.
 */
export function ImportPanel({ reciterId, reciterName, meta, onSave }: Props) {
  const [pending, setPending] = useState<Pending[]>([])
  const [saving, setSaving] = useState(false)
  const [done, setDone] = useState<number | null>(null)
  const input = useRef<HTMLInputElement | null>(null)

  const pick = async (files: FileList | null) => {
    if (!files?.length) return
    setDone(null)
    const { matched, unmatched } = await importFiles([...files])
    setPending([
      ...matched.map((m) => ({ file: m.file, surah: m.surah })),
      ...unmatched.map((f) => ({ file: f, surah: null })),
    ])
  }

  const assign = (index: number, surah: number | null) => {
    setPending((p) => p.map((x, i) => (i === index ? { ...x, surah } : x)))
  }

  const remove = (index: number) => {
    setPending((p) => p.filter((_, i) => i !== index))
  }

  const ready = useMemo(
    () => pending.filter((p) => p.surah !== null) as Array<{ file: File; surah: number }>,
    [pending],
  )

  // Two files aimed at the same surah would silently overwrite each other.
  const clashes = useMemo(() => {
    const seen = new Map<number, number>()
    for (const r of ready) seen.set(r.surah, (seen.get(r.surah) ?? 0) + 1)
    return [...seen.entries()].filter(([, n]) => n > 1).map(([s]) => s)
  }, [ready])

  const save = async () => {
    setSaving(true)
    try {
      await onSave(ready.map((r) => ({ surah: r.surah, file: r.file })))
      setDone(ready.length)
      setPending([])
      if (input.current) input.current.value = ''
    } finally {
      setSaving(false)
    }
  }

  const totalBytes = ready.reduce((a, r) => a + r.file.size, 0)

  return (
    <div className="panel">
      <h2>إضافة ملفات</h2>
      <p>
        أضِف تسجيلات من جهازك لتُحفَظ ضمن <strong>{reciterName}</strong> وتعمل بدون
        اتصال. تُقرأ أرقام السور من أسماء الملفات مثل <code>018.mp3</code> أو{' '}
        <code>Al-Kahf.mp3</code> أو <code>الكهف.mp3</code>؛ وما تعذّر تحديده يُترك لك.
      </p>

      <input
        ref={input}
        type="file"
        accept="audio/*,.mp3,.m4a,.ogg"
        multiple
        className="file-input"
        onChange={(e) => void pick(e.target.files)}
        aria-label="اختيار ملفات صوتية"
      />

      {done !== null && (
        <p className="saved-note">حُفِظت {done} سورة ضمن {reciterName}.</p>
      )}

      {pending.length > 0 && (
        <>
          <p className="count">
            {ready.length} جاهزة من {pending.length} · {formatBytes(totalBytes)}
          </p>

          {clashes.length > 0 && (
            <p className="verify-err">
              أكثر من ملف لنفس السورة: {clashes.join('، ')} — سيُحفَظ الأخير فقط.
            </p>
          )}

          <ul className="import-list">
            {pending.map((p, i) => {
              const m = p.surah ? meta.find((x) => x.surah === p.surah) : null
              return (
                <li key={`${p.file.name}-${i}`} className="import-row">
                  <span className="import-file" title={p.file.name}>
                    {p.file.name}
                    <span className="import-size">{formatBytes(p.file.size)}</span>
                  </span>

                  <select
                    className="surah-select"
                    value={p.surah ?? ''}
                    onChange={(e) => assign(i, e.target.value ? Number(e.target.value) : null)}
                    aria-label={`السورة لملف ${p.file.name}`}
                  >
                    <option value="">— اختر السورة —</option>
                    {meta.map((s) => (
                      <option key={s.surah} value={s.surah}>
                        {s.surah}. {plainName(s.name)}
                      </option>
                    ))}
                  </select>

                  <button
                    className="mini"
                    onClick={() => remove(i)}
                    aria-label={`إزالة ${p.file.name}`}
                  >
                    ✕
                  </button>

                  {m && <span className="import-ok">{m.nameEn}</span>}
                </li>
              )
            })}
          </ul>

          <button
            className="btn solid"
            disabled={!ready.length || saving}
            onClick={() => void save()}
          >
            {saving ? 'جارٍ الحفظ…' : `حفظ ${ready.length} سورة`}
          </button>
          <button className="btn" disabled={saving} onClick={() => setPending([])}>
            إلغاء
          </button>
        </>
      )}
    </div>
  )
}
