"""
Play Console phone screenshots, captioned.

  python scripts/make-store-screenshots.py

Takes the raw device captures in store/raw/ and composes each onto a branded
canvas with a headline, writing store/screenshots-en/phone-N-*.png at
1440x2560 — 9:16 exactly, and over the 1080px-per-side floor that Play wants
before it will consider an app for promotion.

Composed in a headless browser rather than with an image library, for one
reason: Pillow has no Raqm here, so it cannot shape Arabic. It would set
الْقُرَّاء as disconnected letters running the wrong way, which is worse than
having no Arabic at all. A browser shapes it correctly, and it also gives real
webfonts, real hairlines and real corner radii instead of approximations.

---

The design, and why it is this and not the other thing.

The subject is a mushaf you listen to **at night** — the app's own themes are
called Isha, Kiswah, Tahajjud, Rawdah, and every capture here is near-black
because that is what the app looks like in use. So a dark canvas is not a
styling choice, it is a photograph of the product.

The risk with a dark canvas is landing on the house style of every AI-generated
promo image: near-black, one bright accent, a centred sans headline, a glow.
Three things keep this off that:

**The type is the app's own.** The headline is Amiri, which is not a decorative
pick — it is a revival of the Bulaq Press naskh cut for printed masahif in
nineteenth-century Cairo, and it is already the face this app sets the Quran
in. The caption is IBM Plex Sans Arabic, the app's interface face. Nothing here
is a typeface the app does not already use.

**The rules are the hizam.** The two gold hairlines bracketing the headline
echo the embroidered band that runs around the Kiswah — and, more practically,
they echo `store/feature-graphic.png`, which already carries exactly two gold
rules. A listing whose banner and screenshots share one device reads as one
thing.

**The eyebrow is bilingual because the app is.** Arabic first, then the English,
divided by a middot. It says what the app is before the headline says what the
screen does — and it is the one place the design admits, without a sentence of
marketing copy, that this is not an English app with Arabic bolted on.

Everything else is deliberately absent. No glow, no gradient, no device bezel
art, no drop shadow. The capture bleeds off the bottom edge so the composition
says there is more of it, and that is the only gesture.
"""

import base64
import json
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "store" / "raw"
OUT = ROOT / "store" / "screenshots-en"
FONTS = ROOT / "public" / "fonts"

# 720x1280 at 2x is 1440x2560 — 9:16 to the pixel, and both sides clear the
# 1080 floor Play applies before an app can be considered for promotion.
VIEWPORT = {"width": 720, "height": 1280}
SCALE = 2

# Straight from src/ui/theme.css. Inventing a palette for the store when the
# app already has one is how a listing stops looking like the app it sells.
INK = "#0b0a09"
GOLD = "#c9a961"
GOLD_DEEP = "#8a6d33"
CREAM = "#f6f0e6"

# (raw file, Arabic eyebrow, Latin eyebrow, headline)
#
# Each headline says what that screen does. None of them is a claim the app
# cannot keep: sixteen mushafs, 1414 AH, eight themes and the ayah-with-meaning
# layout are all countable in the captures themselves.
SHOTS = [
    (
        "home.jpeg",
        "الْقُرَّاء",
        "Reciters",
        "Sixteen complete mushafs",
    ),
    (
        "reciters.jpeg",
        "الْحَرَمَان",
        "The two Holy Mosques",
        "Taraweeh and Tahajjud, back to 1414 AH",
    ),
    (
        "player.jpeg",
        "دُونَ اتِّصَال",
        "Offline",
        "Download a surah, or a whole mushaf",
    ),
    (
        "translation.jpeg",
        "التَّرْجَمَة",
        "Translation",
        "Every ayah with its meaning beneath it",
    ),
    (
        "themes.jpeg",
        "السِّمَات",
        "Themes",
        "Eight themes, made for the dark",
    ),
]


def data_uri(path: Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def font_face(family: str, file: str, weight: int, unicode_range: str = "") -> str:
    src = data_uri(FONTS / file, "font/woff2")
    rng = f"unicode-range:{unicode_range};" if unicode_range else ""
    return (
        f"@font-face{{font-family:'{family}';font-weight:{weight};"
        f"font-display:block;src:url({src}) format('woff2');{rng}}}"
    )


def build_html(shot_uri: str, arabic: str, latin: str, headline: str) -> str:
    faces = "".join(
        [
            # Latin and Arabic cuts are separate files; the unicode-range keeps
            # the browser from reaching for the Arabic file to set English.
            font_face("Amiri", "amiri-700-latin.woff2", 700, "U+0000-024F"),
            font_face("Amiri", "amiri-400-arabic.woff2", 400, "U+0600-06FF,U+FE70-FEFF"),
            font_face("PlexAr", "ibm-plex-sans-arabic-500-latin.woff2", 500, "U+0000-024F"),
            font_face("PlexAr", "ibm-plex-sans-arabic-500-arabic.woff2", 500, "U+0600-06FF,U+FE70-FEFF"),
        ]
    )
    return f"""<!doctype html><html><head><meta charset="utf-8"><style>
{faces}
*{{margin:0;padding:0;box-sizing:border-box}}
html,body{{width:{VIEWPORT['width']}px;height:{VIEWPORT['height']}px;overflow:hidden}}
body{{background:{INK};display:flex;flex-direction:column;align-items:center}}

/* The hizam: two hairlines with the headline held between them. */
.rule{{width:432px;height:1px;background:{GOLD_DEEP};opacity:.55;flex:none}}
/* Fixed height, not padding.
   A two-line headline used to make the band taller, and because the spacer and
   the rules were flex children they were allowed to shrink to make room — so
   the hizam sat at a different height on every screenshot and the set stopped
   reading as a set. The band is a constant box now and the headline centres
   inside it, whether it runs to one line or two. */
.band{{height:196px;display:flex;flex-direction:column;align-items:center;
  justify-content:center;gap:20px;flex:none}}

.eyebrow{{font-family:'PlexAr',sans-serif;font-weight:500;font-size:17px;
  letter-spacing:.26em;text-transform:uppercase;color:{GOLD};
  display:flex;align-items:center;gap:14px}}
/* The Arabic sits at its own size and is not uppercased — Arabic has no case,
   and letterspacing it would break the joins. */
.eyebrow .ar{{font-family:'Amiri',serif;font-weight:400;font-size:25px;
  letter-spacing:0;text-transform:none;direction:rtl;line-height:1}}
.eyebrow .dot{{opacity:.5}}

.headline{{font-family:'Amiri',serif;font-weight:700;font-size:42px;
  line-height:1.16;color:{CREAM};text-align:center;max-width:580px;
  letter-spacing:.005em;
  /* Two even lines rather than a long one and an orphan. */
  text-wrap:balance}}

.stage{{margin-top:34px;flex:1;display:flex;justify-content:center;width:100%;
  overflow:hidden}}
.shot{{width:512px;height:auto;border-radius:26px;
  border:1px solid rgba(201,169,97,.20);display:block}}
</style></head><body>
  <div style="height:74px;flex:none"></div>
  <div class="rule"></div>
  <div class="band">
    <div class="eyebrow"><span class="ar">{arabic}</span><span class="dot">·</span><span>{latin}</span></div>
    <div class="headline">{headline}</div>
  </div>
  <div class="rule"></div>
  <div class="stage"><img class="shot" src="{shot_uri}"></div>
</body></html>"""


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    missing = [s[0] for s in SHOTS if not (RAW / s[0]).exists()]
    if missing:
        raise SystemExit(f"missing raw captures in {RAW}: {', '.join(missing)}")

    with sync_playwright() as pw:
        browser = pw.chromium.launch()
        page = browser.new_page(viewport=VIEWPORT, device_scale_factor=SCALE)
        for i, (raw, arabic, latin, headline) in enumerate(SHOTS, start=1):
            uri = data_uri(RAW / raw, "image/jpeg")
            page.set_content(build_html(uri, arabic, latin, headline))
            # The fonts are inlined, so this resolves immediately — but without
            # it the first shot can be set in a fallback face.
            page.wait_for_function("document.fonts.ready.then(()=>true)")
            page.wait_for_timeout(250)
            name = raw.rsplit(".", 1)[0]
            path = OUT / f"phone-{i}-{name}.png"
            page.screenshot(path=str(path))
            print(f"  {path.relative_to(ROOT)}")
        browser.close()


if __name__ == "__main__":
    main()
