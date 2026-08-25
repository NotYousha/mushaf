"""
Turns a folder of photographs into the app's bundled portraits.

    python scripts/crop-imam-photos.py C:/Users/yoush/imam-photos
    python scripts/crop-imam-photos.py C:/Users/yoush/imam-photos mishary

Naming pictures after the first argument narrows the run to those, which is how
you re-frame one without touching anything else. It matters: a whole-folder run
rewrites every roster row it recognises, and that will quietly undo a portrait
someone chose by hand — Al-Dosari's is `sheikh.jpg` with a nudged frame, and a
full run replaces it with a plain centre crop.

The medallion is a circle and the dock's card a small square, so anything but
a square source gets stretched by background-size and the face distorts. Each
picture is cropped square here, once, rather than at every render.

The crop is centred horizontally but sits high: in a portrait the face is
almost never at the middle of the frame, and a true centre crop takes the
forehead off and leaves a chest. A third down reads as a portrait.

That rule is good enough for a folder of head-and-shoulders portraits, and not
good enough for every picture. Where it is not, RECITERS below takes an
explicit zoom and centre instead — edit the numbers, re-run, look at the
result. Those entries are also the ones for men who are not Taraweeh imams and
so are named by the catalog rather than by the roster: their portraits are
written to public/ and data/imams.json is left alone, because a reciter is not
an imam and putting him in that roster would claim he led a Ramadan he did not.

Filenames map to roster ids by hand below, because two of them are a genuine
trap: `ahmed-talib` is Ahmad bin Talib bin Humaid of the Prophet's Mosque, and
`saleh-talib` is Salih Al Talib of the Grand Mosque. Different men, and
guessing from the filename would put each under the other's name.
"""

import json
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit("This needs Pillow: pip install Pillow")

# filename stem -> roster id in data/imams.json
NAMES = {
    "sudais": "sudais",
    "shuraim": "shuraim",
    "maher": "muaiqly",
    "baleelah": "baleela",
    "dosari": "dosari",
    "ghamdi": "ghamdi",
    "shamsan": "shamsan",
    "saleh-talib": "altalib",
    "budair": "budair",
    "qasim": "qasim",
    "hudaify": "hudhaify",
    "ahmed-hudaify": "hudhaify-ahmad",
    "buayjan": "buayjan",
    "qurafi": "qarafi",
    "barhaji": "burhaji",
    "ahmed-talib": "humaid",
}

SIDE = 400          # comfortably sharp on a 3x screen at 5.4rem
TOP_BIAS = 0.33     # how far down the square starts, as a fraction of the slack

# Reciters the catalog names directly, with the crop stated rather than guessed.
#
#   out   filename written into public/, and the `photo` a catalog entry asks
#         for in scripts/refresh-catalog.mjs
#   zoom  how tight the crop is. 100 takes the whole of the shorter side; 165
#         takes about three fifths of it, so the face fills more of the circle.
#   cx cy where the crop is centred, as a percentage across and down the
#         picture. 50/50 is dead centre.
#
# To re-frame one of these, change the numbers and run the script again. The
# crop is taken from the original every time, so nothing degrades and there is
# nothing to undo.
RECITERS = {
    # Already square and close to centred; a little zoom past the shoulders.
    "mishary": dict(out="afasy.webp", zoom=112, cx=48, cy=40),
    # Square, but he is looking down and sits high and left in the frame — a
    # centre crop would take the top of his head off and give back a shoulder.
    "abdulaziz-turki": dict(out="turki-abdulaziz.webp", zoom=148, cx=46, cy=36),
}


def framed(im, spec):
    """A square crop of `im` at the stated zoom and centre, kept in bounds."""
    w, h = im.size
    side = max(16, int(round(min(w, h) * 100.0 / spec["zoom"])))
    cx = w * spec["cx"] / 100.0
    cy = h * spec["cy"] / 100.0
    left = int(round(cx - side / 2.0))
    top = int(round(cy - side / 2.0))
    # A centre near an edge would otherwise ask for pixels that are not there.
    left = max(0, min(left, w - side))
    top = max(0, min(top, h - side))
    return im.crop((left, top, left + side, top + side))

src = Path(sys.argv[1] if len(sys.argv) > 1 else "C:/Users/yoush/imam-photos")
# Remaining arguments name the picture stems to process; none means all of them.
only = {a.lower() for a in sys.argv[2:]}
repo = Path(__file__).resolve().parent.parent
out_dir = repo / "public"
roster_path = repo / "data" / "imams.json"

roster = json.loads(roster_path.read_text(encoding="utf-8"))

written, skipped, unknown, reciters = [], [], [], []

for path in sorted(src.iterdir()):
    if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
        continue
    if only and path.stem.lower() not in only:
        continue
    spec = RECITERS.get(path.stem.lower())
    if spec:
        with Image.open(path) as im:
            im = im.convert("RGB")
            size = "%dx%d" % im.size
            out = framed(im, spec).resize((SIDE, SIDE), Image.LANCZOS)
            out.save(out_dir / spec["out"], "WEBP", quality=86, method=6)
        kb = (out_dir / spec["out"]).stat().st_size / 1024
        reciters.append((path.stem, spec["out"], kb, size,
                         "zoom %d, centre %d/%d"
                         % (spec["zoom"], spec["cx"], spec["cy"])))
        continue

    imam = NAMES.get(path.stem.lower())
    if not imam:
        unknown.append(path.name)
        continue
    if imam not in roster:
        skipped.append(f"{path.name} -> {imam} (not in the roster)")
        continue

    with Image.open(path) as im:
        im = im.convert("RGB")
        w, h = im.size
        side = min(w, h)
        left = (w - side) // 2
        # Portraits are taller than wide far more often than not; take the
        # square from high in the frame so the face is not cropped through.
        top = int((h - side) * TOP_BIAS) if h > w else (h - side) // 2
        im = im.crop((left, top, left + side, top + side))
        im = im.resize((SIDE, SIDE), Image.LANCZOS)
        name = f"imam-{imam}.webp"
        im.save(out_dir / name, "WEBP", quality=86, method=6)

    kb = (out_dir / name).stat().st_size / 1024
    roster[imam]["photo"] = name
    # A square crop needs none of the nudging an uncropped original does.
    roster[imam].pop("frames", None)
    written.append((imam, roster[imam]["nameEn"], name, kb, f"{w}x{h}"))

# One imam per line keeps a roster diff readable. Written only when a roster
# row actually changed, so a run that touched none leaves the file alone rather
# than reformatting it — or reverting a hand-picked portrait.
keys = list(roster.keys())
body = "\n".join(
    " " + json.dumps(k, ensure_ascii=False) + ": " + json.dumps(roster[k], ensure_ascii=False)
    + ("," if i < len(keys) - 1 else "")
    for i, k in enumerate(keys)
)
if written:
    roster_path.write_text("{\n" + body + "\n}\n", encoding="utf-8", newline="\n")

for imam, name_en, f, kb, size in written:
    print(f"  {name_en:<28} {f:<26} {kb:5.0f} KB   from {size}")
for stem, f, kb, size, how in reciters:
    print(f"  {stem:<28} {f:<26} {kb:5.0f} KB   from {size}  ({how})")
if unknown:
    print("\nno roster id for: " + ", ".join(unknown))
if only:
    missing = only - {p.stem.lower() for p in src.iterdir()}
    if missing:
        print("\nno such picture: " + ", ".join(sorted(missing)))
if skipped:
    print("\nskipped: " + "; ".join(skipped))
print(f"\n{len(written)} roster portraits and {len(reciters)} reciter "
      f"portraits bundled, total "
      f"{(sum(k for _, _, _, k, _ in written) + sum(k for _, _, k, _, _ in reciters)) / 1024:.2f} MB")
if reciters:
    print("Set `photo` in scripts/refresh-catalog.mjs to match, for: "
          + ", ".join(f for _, f, _, _, _ in reciters))
