"""
The Play Console's own artwork, which is not the app's icons.

  python scripts/make-store-assets.py

Two files nothing else in the repo could be cropped into:

  store/feature-graphic.png   1024x500, mandatory for every listing
  store/icon-512.png          512x512, 32-bit, the listing icon

The feature graphic is built from the wordmark rather than from typed text on
purpose. No font here can set the name: the families in public/fonts are
subset woff2 for the browser, which Pillow cannot open, and substituting some
other Arabic face would set الموعظة in a hand that is not the app's. The
wordmark already is the name, drawn properly, so it is the thing to place.

Colours are the default Mushaf theme's, sampled from the same printed card the
palette in src/ui/themes.css was sampled from — so the listing and the app
look like the same object.
"""

from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "store"

# The dark Mushaf theme: the app's own ground and its gold.
INK = (23, 18, 12)
CARD = (31, 24, 16)
GOLD = (216, 184, 113)
GOLD_SOFT = (107, 87, 48)

FEATURE = (1024, 500)


def vertical_wash(size, top, bottom):
    """A soft top-to-bottom gradient, drawn a row at a time."""
    w, h = size
    im = Image.new("RGB", size, top)
    d = ImageDraw.Draw(im)
    for y in range(h):
        t = y / max(1, h - 1)
        d.line(
            [(0, y), (w, y)],
            fill=tuple(round(a + (b - a) * t) for a, b in zip(top, bottom)),
        )
    return im


def feature_graphic() -> Image.Image:
    """
    The wordmark on the app's own ground, with room around it.

    Play crops this differently in different places in the store, so nothing
    that matters goes near an edge: the mark sits on the centre line and the
    rules stop well inside the frame.
    """
    im = vertical_wash(FEATURE, CARD, INK)
    d = ImageDraw.Draw(im)

    mark = Image.open(ROOT / "public" / "mark-512.png").convert("RGBA")
    # Tall enough to read as the subject, short enough to keep air above and
    # below at the 500px height Play fixes.
    h = 300
    w = round(mark.width * h / mark.height)
    mark = mark.resize((w, h), Image.LANCZOS)

    # The mark's own tile is near-black, which would read as a box floating on
    # the wash. Its glyphs are white, so the tile can simply be dropped and the
    # alpha rebuilt from luminance — leaving the name and nothing behind it.
    px = mark.convert("RGB").load()
    out = Image.new("RGBA", mark.size, (0, 0, 0, 0))
    op = out.load()
    for y in range(mark.height):
        for x in range(mark.width):
            r, g, b = px[x, y]
            lum = (r * 299 + g * 587 + b * 114) // 1000
            if lum > 24:
                op[x, y] = (*GOLD, min(255, round(lum * 1.15)))

    im.paste(out, ((FEATURE[0] - w) // 2, (FEATURE[1] - h) // 2), out)

    # Two hairlines, the width of the mark, as the printed cards have.
    y_top = (FEATURE[1] - h) // 2 - 26
    y_bot = (FEATURE[1] + h) // 2 + 26
    x0 = (FEATURE[0] - w) // 2 - 40
    x1 = x0 + w + 80
    for y in (y_top, y_bot):
        d.line([(x0, y), (x1, y)], fill=GOLD_SOFT, width=2)

    return im


def main() -> None:
    OUT.mkdir(exist_ok=True)

    fg = feature_graphic()
    fg.save(OUT / "feature-graphic.png", "PNG", optimize=True)
    print(f"  store/feature-graphic.png  {fg.size[0]}x{fg.size[1]}")

    # Play wants 32-bit here; the app icon is already RGBA, so this is a copy
    # under the name the Console asks for.
    icon = Image.open(ROOT / "public" / "mark-512.png").convert("RGBA")
    icon.save(OUT / "icon-512.png", "PNG", optimize=True)
    print(f"  store/icon-512.png         {icon.size[0]}x{icon.size[1]} {icon.mode}")


if __name__ == "__main__":
    main()
