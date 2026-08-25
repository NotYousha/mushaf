"""
Builds the app icons and the header mark from the Al-Mau'iza wordmark.

    python scripts/make-app-icons.py [glyph-export.png]

Writes public/icon-192.png, public/icon-512.png,
public/icon-maskable-512.png and public/logo-mark.webp.

logo-mark.webp is the brand object itself, with no white frame: the splash
draws it at 168px and the home header at 48px, both rounding it themselves. The
three PNGs are the same mark prepared for the platforms that crop it.

The source is the type export: black glyphs on transparency, at a size where
the name alone is 853px wide. Working from that rather than from a rendered
square is what keeps the icon sharp -- every output here is a *reduction* of
it, never an enlargement, so nothing is ever softened to fill a canvas. The
glyphs are recoloured through their own alpha, so the edges stay as clean as
the type.

No border, and what that leaves to get right
--------------------------------------------
The mark is the whole square: white name on black, edge to edge. No frame is
drawn, so nothing has to be reasoned about a frame's corners surviving a crop.

What still has to be right is the safe area, because every platform crops the
square to its own shape and the name must not be clipped:

  iOS      a continuous-corner squircle -- not a rounded rectangle. The same
           proportional shape at every size, so Home Screen, App Library,
           Spotlight and Settings all crop identically.
  Android  a "maskable" icon may be cropped to a circle, a squircle, a rounded
           square or a teardrop, chosen by the launcher. Only the centre is
           guaranteed: the inner 80% of the width, as a circle.

The name is about three times as wide as it is tall, so its own corners are
what a crop reaches first. For a centred box of width w and that aspect, the
corners sit at 0.527w from the middle; keeping them inside Android's 0.4 radius
means w must not exceed 0.76 of the square. Hence a narrower setting for the
maskable icon than for the rest -- the one number this file exists to get
right. iOS's squircle is far more generous and clears the wider setting with
room to spare.

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

#: The name's width, as a share of the square.
#:
#: The default, used for the mark itself and for the icons iOS takes. iOS's
#: squircle clips almost nothing at this width -- the name's corner evaluates
#: to 0.29 of the superellipse, well inside it.
GLYPH_WIDE = 0.78
#: For the maskable icon, which may be cropped to a circle. The name's corners
#: sit at 0.527w from the centre, so 0.76 is the most that fits inside the 0.4
#: safe radius; this leaves a little margin on top of that.
GLYPH_SAFE = 0.7


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


def build(size: int, glyph_share: float, glyphs: Image.Image) -> Image.Image:
    """The mark: the name on black, filling the square. No frame, no tile."""
    m = Image.new("RGB", (size, size), TILE)
    place(m, glyphs, int(round(size * glyph_share)))
    return m


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
    ("icon-512.png", build(512, GLYPH_WIDE, glyphs), "PNG"),
    ("icon-192.png", build(192, GLYPH_WIDE, glyphs), "PNG"),
    ("icon-maskable-512.png", build(512, GLYPH_SAFE, glyphs), "PNG"),
    ("logo-mark.webp", build(512, GLYPH_WIDE, glyphs), "WEBP"),
]
for name, im, fmt in outputs:
    if fmt == "WEBP":
        im.save(out_dir / name, fmt, quality=94, method=6)
    else:
        im.save(out_dir / name, fmt, optimize=True)
    kb = (out_dir / name).stat().st_size / 1024
    print(f"  {name:<26} {im.size[0]}x{im.size[1]}  {kb:5.0f} KB")

preview(
    [(f"any (name at {GLYPH_WIDE:.0%})", outputs[0][1]),
     (f"maskable (name at {GLYPH_SAFE:.0%})", outputs[2][1])],
    Path(sys.argv[2]) if len(sys.argv) > 2 else repo / "icon-preview.png",
)
