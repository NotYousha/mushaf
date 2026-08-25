import type { Strings, Lang } from '../i18n'
import { inScript, digits } from '../i18n/script'
import type { Reciter, SurahMeta } from '../catalog/types'
import { Play, Star } from './Icons'

type Props = {
  t: Strings
  lang: Lang
  /** `reciterId:surah`, the same key the star writes. */
  favourites: string[]
  reciters: Reciter[]
  surahMeta: SurahMeta[]
  onPlay: (reciterId: string, surah: number) => void
  onRemove: (key: string) => void
}

/**
 * The surahs someone starred.
 *
 * The star has been in the player since the beginning and there was nowhere
 * to see what it had collected — you could mark a recitation and never find
 * it again. With fifty-seven Taraweeh years in the app, "that Baleela Al-Kahf
 * from 1443" is the whole reason the star exists.
 *
 * Grouped by recitation rather than listed flat, because the same surah under
 * two reciters is two different things to want back.
 */
export function FavouritesPanel({
  t,
  lang,
  favourites,
  reciters,
  surahMeta,
  onPlay,
  onRemove,
}: Props) {
  if (!favourites.length) {
    return (
      <section className="favs">
        <h2 style={{ marginTop: '1.6rem' }}>{t.favourites}</h2>
        <p className="favs-empty">{t.favouritesEmpty}</p>
      </section>
    )
  }

  const byReciter = new Map<string, number[]>()
  for (const key of favourites) {
    const at = key.lastIndexOf(':')
    if (at < 1) continue
    const id = key.slice(0, at)
    const surah = Number(key.slice(at + 1))
    if (!Number.isInteger(surah)) continue
    if (!byReciter.has(id)) byReciter.set(id, [])
    byReciter.get(id)!.push(surah)
  }

  const groups = [...byReciter.entries()]
    .map(([id, surahs]) => ({
      reciter: reciters.find((r) => r.id === id) ?? null,
      id,
      surahs: surahs.sort((a, b) => a - b),
    }))
    // A recitation that is no longer in the catalogue still had its surahs
    // starred; show them under the id rather than dropping them silently.
    .sort((a, b) => (a.reciter?.nameEn ?? a.id).localeCompare(b.reciter?.nameEn ?? b.id))

  return (
    <section className="favs">
      <h2 style={{ marginTop: '1.6rem' }}>{t.favourites}</h2>
      <p className="favs-count">{t.favouritesCount(digits(lang, favourites.length))}</p>

      {groups.map((g) => (
        <div key={g.id} className="favs-group">
          <h3>
            {g.reciter ? inScript(lang, g.reciter.name, g.reciter.nameEn) : g.id}
          </h3>
          <ul className="favs-list">
            {g.surahs.map((surah) => {
              const meta = surahMeta[surah - 1]
              return (
                <li key={`${g.id}:${surah}`} className="fav-row">
                  <button
                    type="button"
                    className="fav-main"
                    onClick={() => onPlay(g.id, surah)}
                  >
                    <span className="fav-num">{digits(lang, surah)}</span>
                    <span className="fav-names">
                      <span className="fav-ar">{meta?.name}</span>
                      {lang !== 'ar' && meta && (
                        <span className="fav-en">
                          {meta.nameEn} · {meta.translation}
                        </span>
                      )}
                    </span>
                    <Play size={18} />
                  </button>
                  <button
                    type="button"
                    className="fav-unstar"
                    aria-label={t.favourite}
                    onClick={() => onRemove(`${g.id}:${surah}`)}
                  >
                    <Star size={16} filled />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      ))}
    </section>
  )
}
