import { useEffect, useState } from 'react'
import type { Strings } from '../i18n'

const PAGES = 604
const BASE = import.meta.env?.BASE_URL ?? '/'

const AR_DIGITS = ['٠', '١', '٢', '٣', '٤', '٥', '٦', '٧', '٨', '٩']
const arabicNumber = (n: number) =>
  String(n)
    .split('')
    .map((d) => AR_DIGITS[Number(d)] ?? d)
    .join('')

type Props = {
  t: Strings
  /** The reading these pages are printed in, shown so it is never in doubt. */
  riwayah: string
  gotoPage?: number | null
  onWentToPage?: () => void
}

/**
 * The mushaf as printed pages, for a riwayah with no machine-readable text.
 *
 * Ad-Duri's wording differs from Hafs, and the only source for it is a PDF
 * whose glyphs are vector drawings — no text layer, no fonts, nothing to
 * address a single word by. So the page is an image.
 *
 * That costs word-by-word highlighting, which would need word positions and
 * word-level audio timings that do not exist for this recitation anyway. What
 * it buys is the right text: the reader follows the recitation on the page it
 * is actually being read from.
 *
 * One page is fetched at a time, so reading costs about 128 KB a page rather
 * than the 79 MB the whole mushaf weighs.
 */
export function PagedMushaf({ t, riwayah, gotoPage, onWentToPage }: Props) {
  const [page, setPage] = useState(1)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!gotoPage) return
    setPage(Math.max(1, Math.min(PAGES, gotoPage)))
    onWentToPage?.()
  }, [gotoPage, onWentToPage])

  useEffect(() => {
    setLoaded(false)
  }, [page])

  const src = (n: number) => `${BASE}duri/${String(n).padStart(3, '0')}.webp`

  return (
    <div className="mushaf">
      <p className="hifz-note">{t.riwayahPages(riwayah)}</p>

      <div className="paged-mushaf">
        {!loaded && <p className="empty small">{t.loading}</p>}
        <img
          src={src(page)}
          alt={t.pageN(page)}
          className={loaded ? 'is-ready' : ''}
          onLoad={() => setLoaded(true)}
          // The next page is almost always where the reader is going, so it
          // is worth having in hand before they ask.
          fetchPriority="high"
        />
        {page < PAGES && (
          <link rel="prefetch" href={src(page + 1)} as="image" />
        )}
      </div>

      <div className="mushaf-bar">
        <button
          className="btn"
          onClick={() => setPage(Math.min(PAGES, page + 1))}
          disabled={page >= PAGES}
        >
          ‹
        </button>
        <span className="mushaf-num">{arabicNumber(page)}</span>
        <button
          className="btn"
          onClick={() => setPage(Math.max(1, page - 1))}
          disabled={page <= 1}
        >
          ›
        </button>
      </div>
    </div>
  )
}
