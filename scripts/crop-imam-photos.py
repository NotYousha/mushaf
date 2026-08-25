"""
Turns a folder of photographs into the app's bundled portraits.

    python scripts/crop-imam-photos.py C:/Users/yoush/imam-photos

The medallion is a circle and the dock's card a small square, so anything but
a square source gets stretched by background-size and the face distorts. Each
picture is cropped square here, once, rather than at every render.

The crop is centred horizontally but sits high: in a portrait the face is
almost never at the middle of the frame, and a true centre crop takes the
forehead off and leaves a chest. A third down reads as a portrait.

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

src = Path(sys.argv[1] if len(sys.argv) > 1 else "C:/Users/yoush/imam-photos")
repo = Path(__file__).resolve().parent.parent
out_dir = repo / "public"
roster_path = repo / "data" / "imams.json"

roster = json.loads(roster_path.read_text(encoding="utf-8"))

written, skipped, unknown = [], [], []

for path in sorted(src.iterdir()):
    if path.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
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

# One imam per line keeps a roster diff readable.
keys = list(roster.keys())
body = "\n".join(
    " " + json.dumps(k, ensure_ascii=False) + ": " + json.dumps(roster[k], ensure_ascii=False)
    + ("," if i < len(keys) - 1 else "")
    for i, k in enumerate(keys)
)
roster_path.write_text("{\n" + body + "\n}\n", encoding="utf-8", newline="\n")

for imam, name_en, f, kb, size in written:
    print(f"  {name_en:<28} {f:<26} {kb:5.0f} KB   from {size}")
if unknown:
    print("\nno roster id for: " + ", ".join(unknown))
if skipped:
    print("\nskipped: " + "; ".join(skipped))
print(f"\n{len(written)} portraits bundled, total "
      f"{sum(k for _, _, _, k, _ in written) / 1024:.2f} MB")
