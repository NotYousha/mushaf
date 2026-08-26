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
    # The Prophet's Mosque, added later. `saad-alghamdi` is the same trap as
    # the two Talibs: Saad Al-Ghamdi of Madinah is not Khalid Al-Ghamdi of
    # Makkah, whose picture is plain `ghamdi`.
    "saad-alghamdi": "ghamdi-saad",
    "muhanna": "muhanna",
    "maghamsi": "maghamsi",
    "khalil": "khalil",
    "husain-alsheikh": "alsheikh",
    "thubaiti": "thubaiti",
}

SIDE = 400          # comfortably sharp on a 3x screen at 5.4rem
TOP_BIAS = 0.33     # how far down the square starts, as a fraction of the slack

# Pictures whose crop is stated rather than guessed, keyed by filename stem.
#
#   zoom  how tight the crop is. 100 takes the whole of the shorter side; 155
#         takes about two thirds of it, so the face fills more of the circle.
#   cx cy where the crop is centred, as a percentage across and down the
#         picture. 50/50 is dead centre.
#
# The centre-and-high rule above is right for a head-and-shoulders portrait and
# wrong for anything else — a photograph taken at a lectern puts the face off to
# one side and small, and a centre square gives back a podium. Naming one here
# overrides the rule for that picture only.
#
# To re-frame, change the numbers and run the script again with just that name.
# The crop is taken from the original every time, so nothing degrades and there
# is nothing to undo.
FRAMING = {
    # Already square and close to centred; a little zoom past the shoulders.
    "mishary": dict(zoom=112, cx=48, cy=40),
    # Square, but he is looking down and sits high and left in the frame — a
    # centre crop would take the top of his head off and give back a shoulder.
    "abdulaziz-turki": dict(zoom=148, cx=46, cy=36),
    # A wide shot at a lectern: he is right of centre and high, and the middle
    # square is mostly podium and backdrop. Centring the crop on him rather
    # than on the picture is what brings his face to the middle of the ring —
    # a lower cx moves the window left, which moves him right in frame.
    "buayjan": dict(zoom=145, cx=57, cy=36),
    # Seated in an armchair, shot wide: the middle square is mostly chair and
    # gilt frame, and his face sits in the top quarter.
    "husain-alsheikh": dict(zoom=200, cx=47, cy=30),
    # Landscape and close-up already: his head fills two thirds of the height,
    # so this barely crops at all and only shifts left to centre him.
    "maghamsi": dict(zoom=105, cx=44, cy=45),
    # Almost square and nearly centred, but the microphone at his chest eats
    # the bottom third of a plain centre crop.
    "muhanna": dict(zoom=167, cx=47, cy=32),
    # Standing at a lectern in a tall frame behind a rank of microphones, so a
    # centre square is mostly microphone. Read off the picture rather than
    # guessed: the first attempt put him at 62/22 and cropped a fold of cloth.
    "thubaiti": dict(zoom=200, cx=47, cy=32),
    # Already square, which is the trap: the centred rule below only crops when
    # the picture is taller than it is wide, so a square source passes through
    # whole and his face ends up small in a medallion with a chest under it.
    # Named here to crop at all. He sits a little right of centre and high.
    "luhaidan": dict(zoom=120, cx=49, cy=43),
}

# Reciters the catalog names directly, and the file it asks for. These are the
# men who are not Taraweeh imams, so nothing about them belongs in the roster.
RECITERS = {
    "mishary": "afasy.webp",
    "abdulaziz-turki": "turki-abdulaziz.webp",
    # Reads the King Fahd Complex's murattal mushaf. Not a Taraweeh imam, so
    # he is named by the catalog and stays out of data/imams.json.
    "luhaidan": "luhaidan.webp",
}


def square(im, spec=None):
    """
    A square crop of `im`: at the stated zoom and centre where one is given,
    otherwise centred horizontally and high in the frame.
    """
    w, h = im.size
    if spec:
        side = max(16, int(round(min(w, h) * 100.0 / spec["zoom"])))
        left = int(round(w * spec["cx"] / 100.0 - side / 2.0))
        top = int(round(h * spec["cy"] / 100.0 - side / 2.0))
    else:
        side = min(w, h)
        left = (w - side) // 2
        # Portraits are taller than wide far more often than not; take the
        # square from high in the frame so the face is not cropped through.
        top = int((h - side) * TOP_BIAS) if h > w else (h - side) // 2
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
    stem = path.stem.lower()
    spec = FRAMING.get(stem)
    how = ("zoom %d, centre %d/%d" % (spec["zoom"], spec["cx"], spec["cy"])
           if spec else "centred, high")

    out_name = RECITERS.get(stem)
    if out_name:
        with Image.open(path) as im:
            im = im.convert("RGB")
            size = "%dx%d" % im.size
            square(im, spec).resize((SIDE, SIDE), Image.LANCZOS).save(
                out_dir / out_name, "WEBP", quality=86, method=6)
        kb = (out_dir / out_name).stat().st_size / 1024
        reciters.append((path.stem, out_name, kb, size, how))
        continue

    imam = NAMES.get(stem)
    if not imam:
        unknown.append(path.name)
        continue
    if imam not in roster:
        skipped.append(f"{path.name} -> {imam} (not in the roster)")
        continue

    with Image.open(path) as im:
        im = im.convert("RGB")
        w, h = im.size
        name = f"imam-{imam}.webp"
        square(im, spec).resize((SIDE, SIDE), Image.LANCZOS).save(
            out_dir / name, "WEBP", quality=86, method=6)

    kb = (out_dir / name).stat().st_size / 1024
    roster[imam]["photo"] = name
    # A square crop needs none of the nudging an uncropped original does.
    roster[imam].pop("frames", None)
    written.append((imam, roster[imam]["nameEn"], name, kb, f"{w}x{h}", how))

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

for imam, name_en, f, kb, size, how in written:
    print(f"  {name_en:<28} {f:<26} {kb:5.0f} KB   from {size}  ({how})")
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
      f"{(sum(k for _, _, _, k, _, _ in written) + sum(k for _, _, k, _, _ in reciters)) / 1024:.2f} MB")
if reciters:
    print("Set `photo` in scripts/refresh-catalog.mjs to match, for: "
          + ", ".join(f for _, f, _, _, _ in reciters))
