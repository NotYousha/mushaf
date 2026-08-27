/**
 * Fetches the translations from Tanzil into public/trans/<id>.json.
 *
 * Shape matches data/quran-text.json — `{ "2": ["ayah 1", "ayah 2", …] }` —
 * because the app already addresses scripture that way and because a keyed
 * object repeating "114:6" six thousand times is a third larger for nothing.
 *
 * They live in public/ rather than in data/ because they are fetched, not
 * bundled. Six translations is eight megabytes of JSON; a reader who wants
 * English should not download Urdu, Hindi, French and the Arabic tafsir to
 * get it. The service worker caches each one the first time it is opened.
 *
 * Licensing, which is not a footnote here:
 *
 * Tanzil's translations are offered for non-commercial use, and using more
 * than three of them obliges a link back to tanzil.net. Al-Mau'iza is free
 * and NOTICES.md carries the link and the per-translator credits.
 *
 * Dr. Mustafa Khattab's *The Clear Quran* is deliberately absent, and it is
 * the one most people ask for. Furqaan Institute of Quranic Education holds
 * an exclusive licence to publish and distribute it; quran.com has withdrawn
 * it from their public API and the Quranic Universal Library is the only
 * resource on that site with its download button removed. Copies circulate
 * on public CDNs and none of them is a licence. Talal Itani's translation,
 * confusingly also titled *Clear Quran*, is a different work under free
 * terms, and it is here instead.
 */
import { writeFileSync, mkdirSync, existsSync, readFileSync } from 'node:fs'

const OUT = 'public/trans'
const CACHE = '.cache/trans'

/**
 * What ships, and why each one.
 *
 * `id` is what the app stores as a preference and requests as a filename, so
 * it never changes once shipped. `lang` is the interface language it is the
 * default for; `en` has two because the choice there is a real one.
 */
const TRANSLATIONS = [
  {
    id: 'en-sahih',
    tanzil: 'en.sahih',
    lang: 'en',
    name: 'Saheeh International',
    translator: 'Saheeh International',
    // The default English. Plain, literal, and the one most readers of
    // English-language Quran apps have already met.
    default: true,
  },
  {
    id: 'en-itani',
    tanzil: 'en.itani',
    lang: 'en',
    name: 'Clear Quran',
    translator: 'Talal Itani',
  },
  {
    id: 'ur-jalandhry',
    tanzil: 'ur.jalandhry',
    lang: 'ur',
    name: 'تفسیر جالندھری',
    translator: 'Fatah Muhammad Jalandhari',
    default: true,
  },
  {
    id: 'hi-hindi',
    tanzil: 'hi.hindi',
    lang: 'hi',
    name: 'हिन्दी अनुवाद',
    translator: 'Suhel Farooq Khan & Saifur Rahman Nadwi',
    default: true,
  },
  {
    id: 'fr-hamidullah',
    tanzil: 'fr.hamidullah',
    lang: 'fr',
    name: 'Le Noble Coran',
    translator: 'Muhammad Hamidullah',
    default: true,
  },
  {
    id: 'ar-muyassar',
    tanzil: 'ar.muyassar',
    lang: 'ar',
    name: 'التفسير الميسر',
    translator: 'مجمع الملك فهد لطباعة المصحف الشريف',
    // Not a translation — Arabic explained in Arabic, a paragraph an ayah.
    // A reader of Arabic needs no translation and may well want this.
    tafsir: true,
    default: true,
  },
]

mkdirSync(OUT, { recursive: true })
mkdirSync(CACHE, { recursive: true })

/** Ayah counts, so a short or long file is caught rather than shipped. */
const AYAHS = JSON.parse(readFileSync('data/surahs.json', 'utf8')).map(
  (s) => s.ayahs,
)
const TOTAL = AYAHS.reduce((a, b) => a + b, 0)

async function fetchTanzil(id) {
  const f = `${CACHE}/${id}.txt`
  if (existsSync(f)) return readFileSync(f, 'utf8')
  const url = `https://tanzil.net/trans/${id}`
  process.stdout.write(`  fetching ${url} … `)
  const res = await fetch(url, { signal: AbortSignal.timeout(120_000) })
  if (!res.ok) throw new Error(`${id}: HTTP ${res.status}`)
  const text = await res.text()
  writeFileSync(f, text)
  console.log(`${text.length} bytes`)
  return text
}

/**
 * Tanzil's `sura|aya|text`, one to a line, with a licence footer.
 *
 * The footer is prose, not data, and it does not start with a comment marker
 * on every line — so lines are taken only while they parse as a numbered
 * ayah, and anything after the first that does not is the footer.
 */
function parse(text) {
  const surahs = {}
  let count = 0
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const first = line.indexOf('|')
    const second = line.indexOf('|', first + 1)
    if (first < 1 || second < 0) continue
    const surah = Number(line.slice(0, first))
    const ayah = Number(line.slice(first + 1, second))
    if (!Number.isInteger(surah) || !Number.isInteger(ayah)) continue
    if (surah < 1 || surah > 114 || ayah < 1 || ayah > AYAHS[surah - 1]) continue
    ;(surahs[surah] ??= [])[ayah - 1] = line.slice(second + 1)
    count++
  }
  return { surahs, count }
}

const manifest = []
for (const t of TRANSLATIONS) {
  console.log(t.id)
  const { surahs, count } = parse(await fetchTanzil(t.tanzil))

  if (count !== TOTAL) throw new Error(`${t.id}: ${count} ayahs, expected ${TOTAL}`)
  for (let s = 1; s <= 114; s++) {
    const got = surahs[s]
    if (!got || got.length !== AYAHS[s - 1] || got.some((a) => typeof a !== 'string')) {
      throw new Error(`${t.id}: surah ${s} is incomplete`)
    }
  }

  const json = JSON.stringify(surahs)
  writeFileSync(`${OUT}/${t.id}.json`, json)
  console.log(`  ${OUT}/${t.id}.json — ${(json.length / 1024).toFixed(0)} KB`)
  manifest.push({
    id: t.id,
    lang: t.lang,
    name: t.name,
    translator: t.translator,
    source: `Tanzil Project — tanzil.net/trans/${t.tanzil}`,
    tafsir: t.tafsir ?? false,
    default: t.default ?? false,
    bytes: json.length,
  })
}

writeFileSync('data/translations.json', JSON.stringify(manifest, null, 1))
console.log(`\ndata/translations.json — ${manifest.length} translations`)
