"""
Builds the app icons from the Al-Mau'iza wordmark.

    python scripts/make-app-icons.py "C:/Users/yoush/Downloads/icon-source.png"

Writes public/icon-192.png, public/icon-512.png and
public/icon-maskable-512.png.

Why this is not just "resize the artwork"
-----------------------------------------
Every platform crops an app icon to its own shape, and the artwork never gets
to keep its corners:

  iOS      a continuous-corner squircle -- not a rounded rectangle. The same
           proportional shape at every size, so Home Screen, App Library,
           Spotlight and Settings all crop identically. A PWA added to the
           Home Screen is masked exactly like a native app.
  Android  a "maskable" icon may be cropped to a circle, a squircle, a rounded
           square or a teardrop, chosen by the launcher. Only the centre is
           guaranteed: the inner 80% of the width, as a circle.

So the white border the design asks for cannot be drawn as a border. A drawn
frame has corners, and the mask cuts them off -- the frame ends up thick along
the flat edges and gone at the diagonals, which is the uneven result this is
avoiding.

Instead the white is full-bleed, edge to edge and into the corners, and the
black tile is inset within it. The platform's mask then cuts the *white*, and
what is left reads as a frame whose outer edge is whatever shape the platform
draws.

For that frame to look even, the tile has to be the same shape as the mask,
concentric with it: the gap between two concentric squircles is constant, the
gap between a squircle and an inscribed rounded rectangle is not. Hence
`squircle()` below, and hence two different insets -- one sized against iOS's
squircle, one against Android's stricter circle.
"""

import sys
from pathlib import Path

try:
    from PIL import Image, ImageDraw
except ImportError:
    sys.exit("This needs Pillow: pip install Pillow")

repo = Path(__file__).resolve().parent.parent
out_dir = repo / "public"

src_path = Path(
    sys.argv[1]
    if len(sys.argv) > 1
    else "C:/Users/yoush/Downloads/ChatGPT Image Aug 25, 2026, 04_07_17 PM.png"
)
if not src_path.exists():
    sys.exit(f"no such file: {src_path}")

# The artwork inside the source's own border, measured rather than guessed:
# the calligraphy, AL-MAU'IZA and AL-QURAN, with the frame and its stroke
# excluded. Re-measure if the source art changes.
ART_BOX = (148, 289, 1115, 1028)

WHITE = (255, 255, 255)
# The tile is the source's own ground rather than pure black, so the artwork's
# rectangle dissolves into it instead of showing a seam.
TILE = (5, 5, 5)

# Drawn at 4x and reduced, because a squircle's edge is the whole point.
SS = 4

# Superellipse exponent. n=4 is a rounded square, n=8 is nearly a square;
# n=5 is the usual approximation of Apple's continuous-corner icon shape.
SQUIRCLE_N = 5

#: How much of the width the black tile takes.
#:
#: iOS crops to a squircle, so a concentric squircle at 86% leaves an even 7%
#: of white all round -- present at the flat edges and still present at the
#: diagonals, which is what "equally surrounding" means once the mask is on.
IOS_TILE = 0.86
#: Android guarantees only the inner 80% *circle*. A squircle's corner sits at
#: about 1.23x its half-width from the centre, so a tile of side s has corners
#: at 0.615s; keeping that inside the 0.4 radius means s <= 0.65. At 0.64 the
#: artwork survives a circle crop, a squircle crop and a teardrop alike.
MASKABLE_TILE = 0.64
#: The artwork's share of the tile, leaving the tile some ground of its own.
ART_IN_TILE = 0.84


def squircle(size: int, n: int = SQUIRCLE_N) -> Image.Image:
    """
    An 'L' mask of a superellipse filling a `size` square.

    |x/a|^n + |y/a|^n <= 1, evaluated per pixel at 1x -- the caller
    supersamples. Cheaper and exact where a Bezier approximation of Apple's
    curve would only be close.
    """
    m = Image.new("L", (size, size), 0)
    px = m.load()
    a = size / 2.0
    for y in range(size):
        # Centre of the pixel, so the shape is symmetric about the middle.
        dy = abs((y + 0.5) - a) / a
        dyn = dy**n
        if dyn > 1.0:
            continue
        for x in range(size):
            dx = abs((x + 0.5) - a) / a
            if dx**n + dyn <= 1.0:
                px[x, y] = 255
    return m


def build(size: int, tile_share: float, art: Image.Image) -> Image.Image:
    """A white square with a concentric squircle tile carrying the artwork."""
    big = size * SS
    canvas = Image.new("RGB", (big, big), WHITE)

    tile_side = int(round(big * tile_share))
    # Odd differences would put the tile half a pixel off centre, and an
    # uneven border is the one thing this is for.
    off = (big - tile_side) // 2

    tile = Image.new("RGB", (tile_side, tile_side), TILE)
    aw = int(round(tile_side * ART_IN_TILE))
    scaled = art.resize((aw, max(1, round(aw * art.height / art.width))), Image.LANCZOS)
    tile.paste(scaled, ((tile_side - scaled.width) // 2, (tile_side - scaled.height) // 2))

    canvas.paste(tile, (off, off), squircle(tile_side))
    return canvas.resize((size, size), Image.LANCZOS)


def preview(icons, path: Path) -> None:
    """
    Each icon under each platform's crop, at Home Screen size.

    The point of looking: whether the white reads as the same thickness at the
    top edge and at the corner. If it thins at the diagonal the tile is too
    large for that mask.
    """
    shot = 120
    masks = [("iOS squircle", squircle(shot * SS)), ("Android circle", None),
             ("rounded square", None)]
    circle = Image.new("L", (shot * SS, shot * SS), 0)
    ImageDraw.Draw(circle).ellipse((0, 0, shot * SS - 1, shot * SS - 1), fill=255)
    rsq = Image.new("L", (shot * SS, shot * SS), 0)
    ImageDraw.Draw(rsq).rounded_rectangle(
        (0, 0, shot * SS - 1, shot * SS - 1), radius=int(shot * SS * 0.22), fill=255
    )
    masks = [("iOS squircle", squircle(shot * SS)), ("Android circle", circle),
             ("rounded square", rsq)]

    pad, label = 16, 20
    sheet = Image.new("RGB", (len(masks) * (shot + pad) + pad,
                              len(icons) * (shot + pad + label) + pad), (108, 112, 120))
    d = ImageDraw.Draw(sheet)
    for r, (name, icon) in enumerate(icons):
        y = pad + r * (shot + pad + label)
        d.text((pad, y), name, fill=(255, 255, 255))
        for c, (mname, mask) in enumerate(masks):
            x = pad + c * (shot + pad)
            big = icon.resize((shot * SS, shot * SS), Image.LANCZOS)
            cell = Image.new("RGB", (shot, shot), (108, 112, 120))
            cell.paste(big.resize((shot, shot), Image.LANCZOS),
                       (0, 0), mask.resize((shot, shot), Image.LANCZOS))
            sheet.paste(cell, (x, y + label))
            if r == 0:
                d.text((x, y - 12 if y > 12 else y), mname, fill=(230, 230, 230))
    sheet.save(path)
    print(f"  preview: {path}")


src = Image.open(src_path).convert("RGB")
art = src.crop(ART_BOX)
print(f"source {src.size} -> artwork {art.size} from {ART_BOX}")

ios512 = build(512, IOS_TILE, art)
ios192 = build(192, IOS_TILE, art)
maskable = build(512, MASKABLE_TILE, art)

for name, im in (("icon-512.png", ios512), ("icon-192.png", ios192),
                 ("icon-maskable-512.png", maskable)):
    im.save(out_dir / name, "PNG", optimize=True)
    kb = (out_dir / name).stat().st_size / 1024
    print(f"  {name:<26} {im.size[0]}x{im.size[1]}  {kb:5.0f} KB")

preview([("any (iOS, 86%)", ios512), ("maskable (Android, 64%)", maskable)],
        Path(sys.argv[2]) if len(sys.argv) > 2 else repo / "icon-preview.png")
