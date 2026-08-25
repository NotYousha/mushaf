import type { Strings, Lang } from '../i18n'
import { digits } from '../i18n/script'
import { brandName, brandSecondary } from '../brand'
import { Search, Chevron } from './Icons'

/** A portrait already resolved to a drawable source and its framing. */
export type HomeFace = {
  id: string
  label: string
  src: string | null
  /** Percentages for background-size and background-position. */
  frame: { zoom: number; x: number; y: number } | null
}

/** Where the listener stopped, with everything needed to say it out loud. */
export type HomeResume = {
  surahName: string
  surahNameEn: string
  /**
   * The verse the recitation had reached, where the reciter is timed.
   *
   * Null is not a failure. Most of the catalogue has no per-verse timing, and
   * inventing a verse number from elapsed seconds would be a confident lie
   * about the Quran — so the card says how far in instead.
   */
  verse: number | null
  /** Elapsed time, as mm:ss, for when the verse is not known. */
  at: string
}

type Props = {
  t: Strings
  lang: Lang
  /** Deployment base, so bundled art resolves from a subpath. */
  base: string
  resume: HomeResume | null
  faces: HomeFace[]
  onResume: () => void
  onPickReciter: (id: string) => void
  onSeeAll: () => void
  onSearch: () => void
}

/**
 * The home screen.
 *
 * Two things earn the space above the fold: the recitation you were already
 * in the middle of, and the voice you want to hear. Everything else the app
 * can do is one tap away in the dock, so it is not repeated here as a grid of
 * shortcuts to places the dock already goes.
 *
 * The name is set in both scripts because it is new and each half teaches the
 * other — the reader's own script large, the other beneath it.
 */
export function HomePanel({
  t,
  lang,
  base,
  resume,
  faces,
  onResume,
  onPickReciter,
  onSeeAll,
  onSearch,
}: Props) {
  return (
    <div className="home">
      <header className="home-head">
        {/* The wordmark is centred on the page, not on the gap between the
            two controls, so it stays put when one of them changes width. */}
        {/*
            The calligraphy-only crop, not the full lockup.

            The wordmark is a lockup: rules, the name, and AL-QURAN beneath.
            At forty-eight pixels the rules and the sub-line are noise and the
            name comes out smaller than the mark it replaced. The splash still
            shows the whole lockup, where there is room for it.
        */}
        <span className="home-mark" aria-hidden="true">
          <img src={`${base}logo-mark.webp`} alt="" width={48} height={48} />
        </span>

        <h1 className="home-brand">
          <span className="home-brand-main">{brandName(lang)}</span>
          <span className="home-brand-alt">
            {brandSecondary(lang)} · {t.appTitle}
          </span>
        </h1>

        <button
          type="button"
          className="home-round"
          onClick={onSearch}
          aria-label={t.homeOpenSearch}
        >
          <Search size={20} />
        </button>
      </header>

      {/*
        The card is the one place on this screen allowed to be ornate: an open
        mushaf behind the text, gold on its edge, and the only filled button.
        It is also the only thing here that knows something the listener does
        not already know — where they stopped.
      */}
      <section className="resume" aria-labelledby="resume-label">
        <span
          className="resume-art"
          aria-hidden="true"
          style={{ backgroundImage: `url('${base}quran-page.webp')` }}
        />
        <div className="resume-body">
          <p className="resume-label" id="resume-label">
            {t.continueReading}
          </p>

          {resume ? (
            <>
              <p className="resume-surah">
                {t.surahWord} {resume.surahName}
              </p>
              <p className="resume-where">
                {resume.surahNameEn}
                {' · '}
                {resume.verse !== null
                  ? t.verseAt(digits(lang, resume.verse))
                  : resume.at}
              </p>
              <button type="button" className="resume-go" onClick={onResume}>
                {t.resumeHere}
              </button>
            </>
          ) : (
            /* An empty state is an invitation, so it points at the thing to
               do rather than reporting that a record is missing. */
            <p className="resume-empty">{t.homeEmpty}</p>
          )}
        </div>
      </section>

      <section className="home-section">
        <div className="home-section-head">
          <h2>{t.reciters}</h2>
          <button type="button" className="see-all" onClick={onSeeAll}>
            {t.seeAll}
            <Chevron size={18} />
          </button>
        </div>

        <ul className="face-grid">
          {faces.map((f) => (
            <li key={f.id}>
              <button
                type="button"
                className="face-cell"
                onClick={() => onPickReciter(f.id)}
              >
                <span
                  className={`face-round${f.src ? '' : ' is-empty'}`}
                  aria-hidden="true"
                  /* Falls back to the per-reciter CSS rules when the portrait
                     is an uncropped original with no framing of its own. */
                  data-reciter={f.frame ? '' : f.id}
                  style={
                    f.src
                      ? {
                          backgroundImage: `url('${f.src}')`,
                          ...(f.frame
                            ? {
                                backgroundSize: `${f.frame.zoom}% auto`,
                                backgroundPosition: `${f.frame.x}% ${f.frame.y}%`,
                              }
                            : undefined),
                        }
                      : undefined
                  }
                />
                <span className="face-cell-name">{f.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
