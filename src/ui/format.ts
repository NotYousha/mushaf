import type { Lang } from '../i18n'
import { digits } from '../i18n/script'

/**
 * Numbers a person reads are written in that person's digits.
 *
 * `lang` is optional so a caller with none — a test, a log line, anything not
 * on screen — still gets Western digits, which is the right default for
 * anything that is not being read by the user.
 */
export function formatBytes(n: number, lang?: Lang): string {
  if (!n) return '—'
  const mb = n / 1_048_576
  const num = mb < 1024 ? String(Math.round(mb)) : (mb / 1024).toFixed(2)
  const unit = mb < 1024 ? 'MB' : 'GB'
  // The unit stays Latin even in Arabic: MB and GB are read as-is on every
  // Arabic phone, and the pair is wrapped so the bidi algorithm cannot
  // reorder a Latin unit through the digits beside it.
  return lang ? `⁨${digits(lang, num)} ${unit}⁩` : `${num} ${unit}`
}

export function formatTime(seconds: number, lang?: Lang): string {
  if (!Number.isFinite(seconds) || seconds < 0) return lang ? digits(lang, '0:00') : '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  const out = h
    ? `${h}:${mm}:${String(s).padStart(2, '0')}`
    : `${mm}:${String(s).padStart(2, '0')}`
  // A clock reads left to right in every language — 1:05 is one minute five,
  // never five past one — so it is isolated as an LTR run and only its digits
  // change.
  return lang ? `⁦${digits(lang, out)}⁩` : out
}
