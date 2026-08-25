/**
 * Applying a theme.
 *
 * The theme and the light/dark choice are two separate decisions — a person
 * who wants Lapis wants it in both — so they are stored and stamped
 * separately: data-theme for the palette, data-mode for the state.
 *
 * "System" is resolved here rather than in CSS. Letting each theme carry its
 * own prefers-color-scheme block would double every palette and make an
 * explicit choice fight the media query; resolving first means the stylesheet
 * only ever sees light or dark.
 */

export type ThemeId =
  | 'isha'
  | 'mushaf'
  | 'kiswah'
  | 'lapis'
  | 'zellij'
  | 'rawdah'
  | 'vellum'
  | 'tahajjud'

export type Mode = 'system' | 'light' | 'dark'

export type Theme = {
  id: ThemeId
  /** Named in Arabic, because the material is named in Arabic. */
  ar: string
  latin: string
  /** What the palette is taken from, for the picker's second line. */
  ofAr: string
  ofEn: string
  /** Swatch: ground, accent, ink, and the card's own hairline, per mode. */
  swatch: {
    light: [string, string, string, string]
    dark: [string, string, string, string]
  }
  /** Themes that only make sense after dark still have a day palette, but
   *  this is the one they are meant to be seen in. */
  prefers?: 'dark'
}

export const THEMES: Theme[] = [
  {
    /*
     * The mark's own palette: white script on black, and the night it is read
     * in. Kiswah is already black — but black and *gold*, the Kaaba's cloth.
     * This one has no metal in it at all. Its light mode is the same material
     * the other way up: the Haram's white marble, with the night as the ink.
     */
    id: 'isha',
    ar: 'العِشاء',
    latin: 'Isha',
    ofAr: 'رُخامٌ وليل',
    ofEn: 'Marble and night',
    swatch: {
      light: ['#eceef2', '#4a5b76', '#11161f', '#dde2ea'],
      dark: ['#07080b', '#c3cddd', '#f6f8fc', '#1b2029'],
    },
    prefers: 'dark',
  },
  {
    id: 'mushaf',
    ar: 'مصحف',
    latin: 'Mushaf',
    ofAr: 'كريمي وذهبي',
    ofEn: 'Cream and gold',
    swatch: { light: ['#f5edda', '#c9a961', '#43301a', '#ebdec4'], dark: ['#17120c', '#d8b871', '#f8f1e1', '#33291a'] },
  },
  {
    id: 'kiswah',
    ar: 'الكسوة',
    latin: 'Kiswah',
    ofAr: 'سواد الكعبة وذهبها',
    ofEn: "The Kaaba's covering",
    swatch: { light: ['#f2f0ea', '#8a6c18', '#100f0c', '#e2dcc4'], dark: ['#000000', '#c9a227', '#fffaef', '#241f0e'] },
    prefers: 'dark',
  },
  {
    id: 'lapis',
    ar: 'اللازورد',
    latin: 'Lapis',
    ofAr: 'زخرفة المصاحف',
    ofEn: 'Illuminated manuscript',
    swatch: { light: ['#e7edf9', '#24568f', '#0b1526', '#d3e1f5'], dark: ['#0a1324', '#86b0e6', '#f1f6ff', '#1d3253'] },
  },
  {
    id: 'zellij',
    ar: 'الزليج',
    latin: 'Zellij',
    ofAr: 'خزف فاس',
    ofEn: 'Glazed tilework',
    swatch: { light: ['#eaf3f1', '#0d7d79', '#0a1a18', '#cdeae5'], dark: ['#061513', '#3ec0b8', '#eefaf9', '#123330'] },
  },
  {
    id: 'rawdah',
    ar: 'الروضة',
    latin: 'Rawdah',
    ofAr: 'خُضرة المسجد النبوي',
    ofEn: "The Prophet's Mosque",
    swatch: { light: ['#eef5f0', '#1f5c3b', '#0c1712', '#d8ebe0'], dark: ['#08150e', '#63b183', '#eefaf1', '#14301f'] },
  },
  {
    id: 'vellum',
    ar: 'الرَّق',
    latin: 'Vellum',
    ofAr: 'مخطوط قديم',
    ofEn: 'Parchment and rubric',
    swatch: { light: ['#e9dfc7', '#9c3826', '#261e15', '#e0cdae'], dark: ['#141009', '#d97a5e', '#f7eeda', '#30251a'] },
  },
  {
    id: 'tahajjud',
    ar: 'التهجد',
    latin: 'Tahajjud',
    ofAr: 'قبيل الفجر',
    ofEn: 'The hour before Fajr',
    swatch: { light: ['#f3ece8', '#a8552a', '#241811', '#ecdccb'], dark: ['#0a0806', '#d99a4e', '#f7e9cf', '#241c12'] },
    prefers: 'dark',
  },
]

/*
 * Isha, so the app opens in the palette its own mark is drawn in.
 *
 * The *mode* is still the device's — see DEFAULT_MODE. On a phone set to dark
 * this opens as the mark itself, white on black; on one set to light it opens
 * as the same material inverted, ink on marble. Forcing dark here would
 * override a system preference someone set deliberately.
 */
export const DEFAULT_THEME: ThemeId = 'isha'
export const DEFAULT_MODE: Mode = 'system'

/**
 * Where the boot script in index.html and this module meet.
 *
 * The preference itself lives in IndexedDB with every other setting. These two
 * keys hold a copy of it that can be read without awaiting anything, which is
 * the only reason they exist.
 */
export const THEME_KEY = 'mushaf:theme'
export const MODE_KEY = 'mushaf:mode'

const isTheme = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v)

const isMode = (v: unknown): v is Mode => v === 'system' || v === 'light' || v === 'dark'

/**
 * A theme retired between releases is still sitting in the storage of everyone
 * who chose it, and `data-theme="oldname"` matches no block in themes.css: the
 * page would come up in the default palette while the picker showed nothing
 * selected. Every stored value is passed through here on its way back into the
 * app so that mismatch can only ever become a real choice.
 */
export const asTheme = (v: unknown, fallback: ThemeId = DEFAULT_THEME): ThemeId =>
  isTheme(v) ? v : fallback

export const asMode = (v: unknown, fallback: Mode = DEFAULT_MODE): Mode =>
  isMode(v) ? v : fallback

/**
 * The choice the boot script acted on, so React's first render agrees with what
 * is already stamped on <html>.
 *
 * Seeding state from IndexedDB is impossible — it cannot be read without
 * awaiting — so without this the app mounts holding the default theme, stamps
 * cream over whatever the boot script had got right, and only puts the real
 * palette back when IndexedDB answers a second later. That overwrite, not the
 * boot script, is what the flash of cream on launch actually was.
 */
export function bootPreference(): { theme: ThemeId; mode: Mode } {
  try {
    return {
      theme: asTheme(localStorage.getItem(THEME_KEY)),
      mode: asMode(localStorage.getItem(MODE_KEY)),
    }
  } catch {
    // Site data blocked. Nothing can be recovered, but the boot script fell
    // back to these same defaults, so the two still agree and nothing moves.
    return { theme: DEFAULT_THEME, mode: DEFAULT_MODE }
  }
}

export const themeById = (id: string): Theme =>
  THEMES.find((t) => t.id === id) ?? THEMES[0]

const media = () =>
  typeof window !== 'undefined' && window.matchMedia
    ? window.matchMedia('(prefers-color-scheme: dark)')
    : null

export const resolveMode = (mode: Mode): 'light' | 'dark' =>
  mode === 'system' ? (media()?.matches ? 'dark' : 'light') : mode

/**
 * Stamp the choice on the document.
 *
 * The browser chrome is told too: on a phone the status bar sits directly
 * against the app, and a cream bar over a black theme is the one thing that
 * gives away that the theme is only skin deep.
 */
export function applyTheme(themeId: string, mode: Mode) {
  if (typeof document === 'undefined') return
  const id = asTheme(themeId)
  const resolved = resolveMode(mode)
  const root = document.documentElement
  root.setAttribute('data-theme', id)
  root.setAttribute('data-mode', resolved)

  // Mirrored so the boot script in index.html can stamp this again on the next
  // launch before the page paints. IndexedDB is the source of truth; this is
  // only a copy that can be read synchronously.
  try {
    localStorage.setItem(THEME_KEY, id)
    localStorage.setItem(MODE_KEY, mode)
  } catch {
    /* private window; the flash is the only cost */
  }

  const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
  if (bg) {
    let meta = document.querySelector('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.setAttribute('name', 'theme-color')
      document.head.appendChild(meta)
    }
    meta.setAttribute('content', bg)
  }
}

/** Re-stamp when the system flips, but only while following the system. */
export function watchSystemMode(onChange: () => void): () => void {
  const m = media()
  if (!m) return () => {}
  m.addEventListener('change', onChange)
  return () => m.removeEventListener('change', onChange)
}
