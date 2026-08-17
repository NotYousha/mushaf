export function formatBytes(n: number): string {
  if (!n) return '—'
  const mb = n / 1_048_576
  if (mb < 1024) return `${Math.round(mb)} MB`
  return `${(mb / 1024).toFixed(2)} GB`
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  const mm = h ? String(m).padStart(2, '0') : String(m)
  return h
    ? `${h}:${mm}:${String(s).padStart(2, '0')}`
    : `${mm}:${String(s).padStart(2, '0')}`
}
