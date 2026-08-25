"""
Builds the app icons and the header mark from the Al-Mau'iza wordmark.

    python scripts/make-app-icons.py [glyph-export.png]

Writes public/icon-192.png, public/icon-512.png,
public/icon-maskable-512.png and public/logo-mark.webp.

The source is the type export: black glyphs on transparency, at a size where
the name alone is 853px wide. Working from that rather than from a rendered
square is what keeps the icon sharp -- every output here is a *reduction* of
it, never an enlargement, so nothing is ever softened to fill a canvas. The
glyphs are recoloured through their own alpha, so the edges stay as clean as
the type.

Why the white border is not drawn as a border
---------------------------------------------
Every platform crops an app icon to its own shape, and the artwork never gets
to keep its corners:

  iOS      a continuous-corner squircle -- not a rounded rectangle. The same
           proportional shape at every size, so Home Screen, App Library,
           Spotlight and Settings all crop identically. A PWA added to the
           Home Screen is masked exactly like a native app.
  Android  a "maskable" icon may be cropped to a circle, a squircle, a rounded
           square or a teardrop, chosen by the launcher. Only the centre is
           guaranteed: the inner 80% of the width, as a circle.

So a drawn frame has corners, the mask cuts them off, and what is left is
thick along the flat edges and gone at the diagonals -- an uneven border.

Instead the white is full-bleed, edge to edge and into the corners, and the
black tile is inset within it. The platform's mask cuts the *white*, and what
remains reads as a frame whose outer edge is the platform's own shape.

For that frame to look even, the tile has to be the same shape as the mask and
concentric with it: the gap between two concentric squircles is constant, the
gap between a squircle and an inscribed rounded rectangle is not. Hence a real
superellipse below, and hence two insets -- one sized against iOS's squircle,
one against Android's stricter circle.
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
    sys.argv[1] if len(sys.argv) > 1 else "C:/Users/yoush/Downloads/El-Messiri-export.png"
)
if not src_path.exists():
    sys.exit(f"no such file: {src_path}")

WHITE = (255, 255, 255)
#: The tile is pure black, as the style reference is.
TILE = (0, 0, 0)

#: Superellipse exponent. 4 is a rounded square, 8 is nearly a square; 5 is
#: the usual approximation of Apple's continuous-corner icon shape.
SQUIRCLE_N = 5
#: The squircle is drawn large and reduced, because its edge is the whole
#: point. The glyphs are *not* supersampled -- they are pasted at final size,
#: which for every output here is a reduction of the source.
MASK_SS = 4

#: How much of the width the black tile takes.
#:
#: iOS crops to a squircle, so a concentric squircle at 86% leaves an even 7%
#: of white all round -- present at the flat edges and still present at the
#: diagonals, which is what "equally surrounding" means once the mask is on.
IOS_TILE = 0.86
#: Android guarantees only the inner 80% *circle*. A squircle's corner sits at
#: about 1.23x its half-width from the centre, so a tile of side s has corners
#: at 0.615s; keeping that inside the 0.4 radius means s <= 0.65.
MASKABLE_TILE = 0.64
#: The name's width as a share of the tile it sits in. Chosen so that on the
#: iOS icon the glyphs come out at 62% of the whole canvas -- the proportion of
#: the style reference, measured off it rather than guessed.
GLYPH_IN_TILE = 0.72
#: On the bare mark there is no white frame to leave room for, and it is drawn
#: at forty-eight pixels inside a bordered box that already separates it from
#: the page -- so the name takes more of the square than it does on the icon.
#: At 0.62 it read noticeably smaller than the mark it replaced.
GLYPH_ON_MARK = 0.78


def load_glyphs(path: Path) -> Image.Image:
    """
    The name as white pixels on transparency, cropped to its own ink.

    Two kinds of source work. A type export carries the glyphs on a real alpha
    channel, which is used directly. A rendered square carries them as light
    pixels on a dark ground, and there its own brightness *is* the coverage --
    so luminance becomes the alpha.

    Either way the colour is replaced and the coverage kept, rather than the
    pixels being inverted: an invert would turn the ground white too, and every
    antialiased edge would come back with a dark fringe around it.
    """
    im = Image.open(path)
    alpha = None
    if im.mode in ("RGBA", "LA"):
        a = im.convert("RGBA").getchannel("A")
        # A fully opaque alpha channel is not a mask, it is just a flat image.
        if a.getextrema()[0] < 250:
            alpha = a
            kind = "alpha channel"
    if alpha is None:
        alpha = im.convert("L")
        kind = "luminance (light glyphs on a dark ground)"

    # The box is found from a thresholded copy, not from the alpha itself.
    # A rendered square's "black" ground is never quite zero -- a few units of
    # encoder noise is enough for getbbox() to call the whole canvas content,
    # and the name would then be scaled as though it filled the square and
    # come out a third of its intended size. The crop is applied to the
    # unthresholded alpha, so the soft edges survive.
    box = alpha.point(lambda v: 255 if v > 40 else 0).getbbox()
    if box is None:
        sys.exit("that image has no glyphs above the noise floor")
    alpha = alpha.crop(box)
    glyphs = Image.new("RGBA", alpha.size, WHITE + (0,))
    glyphs.putalpha(alpha)
    print(f"  read coverage from {kind}")
    return glyphs


def squircle(size: int, n: int = SQUIRCLE_N) -> Image.Image:
    """An 'L' mask of the superellipse |x/a|^n + |y/a|^n <= 1, filling a square."""
    m = Image.new("L", (size, size), 0)
    px = m.load()
    a = size / 2.0
    for y in range(size):
        # Pixel centres, so the shape is symmetric about the middle.
        dy = abs((y + 0.5) - a) / a
        dyn = dy**n
        if dyn > 1.0:
            continue
        for x in range(size):
            if (abs((x + 0.5) - a) / a) ** n + dyn <= 1.0:
                px[x, y] = 255
    return m


def squircle_mask(size: int) -> Image.Image:
    """The same shape, antialiased, at the size actually needed."""
    return squircle(size * MASK_SS).resize((size, size), Image.LANCZOS)


def place(canvas: Image.Image, glyphs: Image.Image, target_w: int) -> None:
    """Centre the name on `canvas`, scaled to `target_w` and never enlarged."""
    if target_w > glyphs.width:
        print(
            f"  ! the name would be enlarged to {target_w}px from "
            f"{glyphs.width}px — it will soften"
        )
    h = max(1, round(target_w * glyphs.height / glyphs.width))
    scaled = glyphs.resize((target_w, h), Image.LANCZOS)
    canvas.paste(
        scaled,
        ((canvas.width - target_w) // 2, (canvas.height - h) // 2),
        scaled,
    )


def build_mark(size: int, glyphs: Image.Image) -> Image.Image:
    """A plain black square carrying the name — the badge, and the splash."""
    m = Image.new("RGB", (size, size), TILE)
    place(m, glyphs, int(round(size * GLYPH_ON_MARK)))
    return m


def build_icon(size: int, tile_share: float, glyphs: Image.Image) -> Image.Image:
    """White full-bleed, with a concentric squircle tile carrying the name."""
    canvas = Image.new("RGB", (size, size), WHITE)
    side = int(round(size * tile_share))
    # An odd remainder would put the tile half a pixel off centre, and an
    # uneven border is the one thing this exists to avoid.
    off = (size - side) // 2

    tile = Image.new("RGB", (side, side), TILE)
    place(tile, glyphs, int(round(side * GLYPH_IN_TILE)))
    canvas.paste(tile, (off, off), squircle_mask(side))
    return canvas


def preview(icons, path: Path) -> None:
    """
    Each icon under each platform's crop, at Home Screen size.

    What to look for: whether the white reads as the same thickness at the top
    edge and at the corner. If it thins at the diagonal, the tile is too large
    for that mask.
    """
    shot = 120
    big = shot * MASK_SS
    circle = Image.new("L", (big, big), 0)
    ImageDraw.Draw(circle).ellipse((0, 0, big - 1, big - 1), fill=255)
    rsq = Image.new("L", (big, big), 0)
    ImageDraw.Draw(rsq).rounded_rectangle(
        (0, 0, big - 1, big - 1), radius=int(big * 0.22), fill=255
    )
    masks = [
        ("iOS squircle", squircle(big)),
        ("Android circle", circle),
        ("rounded square", rsq),
    ]

    pad, label = 18, 22
    sheet = Image.new(
        "RGB",
        (len(masks) * (shot + pad) + pad, len(icons) * (shot + pad + label) + pad + 8),
        (108, 112, 120),
    )
    d = ImageDraw.Draw(sheet)
    for c, (mname, _) in enumerate(masks):
        d.text((pad + c * (shot + pad), 4), mname, fill=(235, 235, 235))
    for r, (name, icon) in enumerate(icons):
        y = pad + 8 + r * (shot + pad + label)
        d.text((pad, y), name, fill=(255, 255, 255))
        for c, (_, mask) in enumerate(masks):
            cell = Image.new("RGB", (shot, shot), (108, 112, 120))
            cell.paste(
                icon.resize((shot, shot), Image.LANCZOS),
                (0, 0),
                mask.resize((shot, shot), Image.LANCZOS),
            )
            sheet.paste(cell, (pad + c * (shot + pad), y + label))
    sheet.save(path)
    print(f"  preview: {path}")


glyphs = load_glyphs(src_path)
print(f"source {Image.open(src_path).size} -> name {glyphs.size}")

outputs = [
    ("icon-512.png", build_icon(512, IOS_TILE, glyphs), "PNG"),
    ("icon-192.png", build_icon(192, IOS_TILE, glyphs), "PNG"),
    ("icon-maskable-512.png", build_icon(512, MASKABLE_TILE, glyphs), "PNG"),
    ("logo-mark.webp", build_mark(512, glyphs), "WEBP"),
]
for name, im, fmt in outputs:
    if fmt == "WEBP":
        im.save(out_dir / name, fmt, quality=94, method=6)
    else:
        im.save(out_dir / name, fmt, optimize=True)
    kb = (out_dir / name).stat().st_size / 1024
    print(f"  {name:<26} {im.size[0]}x{im.size[1]}  {kb:5.0f} KB")

preview(
    [("any (iOS, 86%)", outputs[0][1]), ("maskable (Android, 64%)", outputs[2][1])],
    Path(sys.argv[2]) if len(sys.argv) > 2 else repo / "icon-preview.png",
)
