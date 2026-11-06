"""
How wide a mushaf face sets our lines, measured against another face.

    python scripts/measure-mushaf-face.py FACE.woff2 REFERENCE.woff2 LAYOUT.json

Prints one JSON object on stdout. fetch-mushaf-fonts.mjs runs this and folds
the answer into data/fonts.json; it is also runnable by hand.

Why this exists
---------------
data/mushaf-layout.json carries the King Fahd Complex's own line breaks. We
set them in a face that is not the one those breaks were computed for, so the
lines come out short of the measure and MushafView stretches them sideways to
compensate (MAX_STRETCH). The obvious hope is that adopting the Complex's own
face removes the need for that. Whether it does is a measurement, not an
opinion, so this makes it.

The widths are real shaping, not a sum of nominal advances: Arabic advance
width depends on which positional form each letter takes and on mark
attachment, so the text is run through HarfBuzz exactly as a browser would,
and the advances of the resulting glyphs are summed. Sizes are divided by
unitsPerEm, which is what "at the same nominal font size" means when two faces
disagree about how many units an em is.

Three numbers come out, and they answer different questions:

  widthRatio        line width in FACE over line width in REFERENCE at the
                    same nominal size. Answers "is it wider".

  verticalInkRatio  how much less vertical room FACE's ink needs. A Quranic
                    face's em is mostly empty space reserved for stacked
                    marks, and two faces reserve wildly different amounts, so
                    a width ratio at equal nominal size flatters whichever
                    face draws smaller. This is the correction factor, and it
                    is measured from the ink of real lines rather than from
                    the vertical metrics, which are aspirational.

  stretchNeeded     what MushafView's fit routine would actually ask of each
                    line, modelled from its own arithmetic. This is the one
                    that decides whether the stretch hack can go, and it is
                    not implied by the other two: the fit routine sizes the
                    type from the widest line on the page, so a face's
                    absolute width cancels out and only the spread of line
                    widths within a page survives.
"""

import json
import statistics
import sys
from fontTools.ttLib import TTFont
from fontTools.pens.boundsPen import BoundsPen
import uharfbuzz as hb

# Mirrors of MushafView.tsx. If they drift there, they must drift here, or
# this models a renderer we do not ship.
MIN_GAP_EM = 0.12
MAX_STRETCH = 1.34
# An ayah rosette is a fixed box — .ayah-mark is min-width 1.5em at
# font-size 0.6em — so its width is the same whichever face is in use, and it
# must not be shaped as text or it would credit one face with the difference.
MARK_EM = 0.9


class Face:
    """A face loaded twice: fontTools for outlines, HarfBuzz for shaping."""

    def __init__(self, path):
        self.path = path
        font = TTFont(path)
        self.upm = font["head"].unitsPerEm
        self.family = font["name"].getDebugName(1)
        self.order = font.getGlyphOrder()
        self.cmap = set()
        for sub in font["cmap"].tables:
            if sub.isUnicode():
                self.cmap |= set(sub.cmap.keys())

        # Whether the face can shape Arabic at all. A Quranic face with no
        # GSUB would render every letter in its isolated form — legible as a
        # list of letters, and not Arabic.
        self.shaping = {}
        for tag in ("GSUB", "GPOS"):
            if tag not in font:
                self.shaping[tag] = None
                continue
            table = font[tag].table
            self.shaping[tag] = {
                "scripts": sorted(
                    r.ScriptTag.strip() for r in table.ScriptList.ScriptRecord
                ),
                "features": sorted(
                    {r.FeatureTag for r in table.FeatureList.FeatureRecord}
                ),
            }
        self.shaping["GDEF"] = "GDEF" in font

        glyphs = font.getGlyphSet()
        self.bounds = {}
        for name in self.order:
            pen = BoundsPen(glyphs)
            try:
                glyphs[name].draw(pen)
            except Exception:
                pass
            self.bounds[name] = pen.bounds

        # HarfBuzz reads sfnt, and will not open a WOFF2 unless it was built
        # with the decoder. fontTools always has it, so round-trip through
        # fontTools' own sfnt output rather than depend on the build.
        font.flavor = None
        from io import BytesIO

        buf = BytesIO()
        font.save(buf)
        self.hb = hb.Font(hb.Face(hb.Blob(buf.getvalue())))
        self._cache = {}

    def shape(self, text):
        buf = hb.Buffer()
        buf.add_str(text)
        # Set rather than guessed: guess_segment_properties would read the
        # direction off the first strong character, and a line that opens with
        # a digit would be measured left to right.
        buf.direction = "rtl"
        buf.script = "Arab"
        buf.language = "ar"
        hb.shape(self.hb, buf)
        return buf

    def advance(self, text):
        """Shaped advance width of one word, in em."""
        hit = self._cache.get(text)
        if hit is None:
            buf = self.shape(text)
            hit = sum(p.x_advance for p in buf.glyph_positions) / self.upm
            self._cache[text] = hit
        return hit

    def ink(self, text):
        """(width, bottom, top) of the shaped ink of a line, in em."""
        buf = self.shape(text)
        width = 0.0
        low, high = None, None
        for info, pos in zip(buf.glyph_infos, buf.glyph_positions):
            box = self.bounds[self.order[info.codepoint]]
            if box:
                bottom = box[1] + pos.y_offset
                top = box[3] + pos.y_offset
                low = bottom if low is None else min(low, bottom)
                high = top if high is None else max(high, top)
            width += pos.x_advance
        if low is None:
            return width / self.upm, 0.0, 0.0
        return width / self.upm, low / self.upm, high / self.upm


def read_lines(layout):
    """Every line as (word texts, total token count)."""
    out = []
    for page in layout["pages"]:
        rows = []
        for line in page:
            # A token with no ayah key is a rosette, not a word.
            words = [w[0] for w in line["w"] if len(w) > 1]
            rows.append((words, len(line["w"])))
        out.append(rows)
    return out


def stretch_profile(face, pages):
    """
    What MushafView's fit routine would ask of each line, per its own maths.

    fitPage sizes the type so the widest line on the page exactly fills the
    measure, then stretches every other line out to the same width. So the
    factor a line needs is set by how far short of the page's widest line it
    falls — which makes this a measure of the spread of line widths within a
    page, and *not* of how wide the face is. That is the whole reason a wider
    face does not automatically retire the stretch.
    """
    wants = []
    for rows in pages:
        naturals = []
        for words, tokens in rows:
            marks = tokens - len(words)
            naturals.append(
                (sum(face.advance(w) for w in words) + marks * MARK_EM, tokens)
            )
        widths = [nat + MIN_GAP_EM * (n - 1) for nat, n in naturals if n]
        if not widths:
            continue
        widest = max(widths)
        for nat, tokens in naturals:
            if tokens < 2 or nat <= 0:
                continue
            # avail = fit * widest / 0.998, and every `base * fit` cancels.
            wants.append((widest / 0.998 - MIN_GAP_EM * (tokens - 1)) / nat)
    wants.sort()
    n = len(wants)
    return {
        "lines": n,
        "mean": round(statistics.mean(wants), 4),
        "median": round(statistics.median(wants), 4),
        "p90": round(wants[int(0.90 * n)], 4),
        "p99": round(wants[int(0.99 * n)], 4),
        "max": round(wants[-1], 4),
        "linesAtCap": sum(1 for w in wants if w > MAX_STRETCH),
        "shareAtCap": round(sum(1 for w in wants if w > MAX_STRETCH) / n, 4),
    }


def main():
    face_path, ref_path, layout_path = sys.argv[1:4]
    face, ref = Face(face_path), Face(ref_path)
    layout = json.load(open(layout_path, encoding="utf-8"))
    pages = read_lines(layout)

    texts = [" ".join(words) for rows in pages for words, _ in rows if len(words) >= 2]

    ratios, widths_ref, ink_face, ink_ref = [], [], [], []
    for text in texts:
        wf, lof, hif = face.ink(text)
        wr, lor, hir = ref.ink(text)
        if wr <= 0:
            continue
        ratios.append(wf / wr)
        widths_ref.append(wr)
        ink_face.append(hif - lof)
        ink_ref.append(hir - lor)

    order = sorted(range(len(ratios)), key=lambda i: ratios[i])
    srt = [ratios[i] for i in order]
    n = len(srt)
    # The longest lines matter most: they are the ones that set the page's
    # type size, so they are where a shortfall is actually paid for.
    longest = sorted(range(len(ratios)), key=lambda i: -widths_ref[i])[: max(40, n // 200)]

    vertical = statistics.median(ink_ref) / statistics.median(ink_face)

    print(
        json.dumps(
            {
                "face": {"family": face.family, "unitsPerEm": face.upm,
                         "cmapCodepoints": len(face.cmap),
                         "shaping": face.shaping},
                "reference": {"family": ref.family, "unitsPerEm": ref.upm,
                              "cmapCodepoints": len(ref.cmap),
                              "shaping": ref.shaping},
                "linesMeasured": n,
                # Same nominal font size. The plain answer to "is it wider".
                "widthRatio": {
                    "mean": round(statistics.mean(srt), 4),
                    "median": round(statistics.median(srt), 4),
                    "min": round(srt[0], 4),
                    "p05": round(srt[int(0.05 * n)], 4),
                    "p95": round(srt[int(0.95 * n)], 4),
                    "max": round(srt[-1], 4),
                    "longestLines": round(
                        statistics.mean([ratios[i] for i in longest]), 4
                    ),
                },
                # How much less vertical room the face's ink needs, and so how
                # much larger it may be set before it takes the room the
                # reference took. Multiply the width ratio by this for the
                # ratio at equal vertical footprint.
                "verticalInkEm": {
                    "face": round(statistics.median(ink_face), 4),
                    "reference": round(statistics.median(ink_ref), 4),
                    "faceWorst": round(max(ink_face), 4),
                    "referenceWorst": round(max(ink_ref), 4),
                },
                "verticalInkRatio": round(vertical, 4),
                "widthRatioAtEqualVerticalInk": round(
                    statistics.mean(srt) * vertical, 4
                ),
                # The number that decides whether MushafView's scaleX can go.
                "stretchNeeded": {
                    "face": stretch_profile(face, pages),
                    "reference": stretch_profile(ref, pages),
                },
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
