"""
Renders the Ad-Duri mushaf to one image per page.

Al-Juhany recites in the riwayah of Ad-Duri from Abu Amr al-Basri, which is
different wording from the Hafs text everything else in this app is built on.
Showing the Hafs page under his recitation would have the page quietly
disagreeing with the voice, so this mushaf gets its own pages.

The source PDF carries no text layer at all — every glyph is drawn as vector
paths, which is why there is no font list and nothing to extract. So the pages
are rendered as images. That rules out word-by-word highlighting for this
riwayah, which would need word positions and, separately, word-level audio
timings that nobody has published for this recording. What it does give is the
correct text, legibly, which is the thing that actually matters.

Grayscale because the source is black ink on white; WebP because it halves
PNG at this quality. One page is fetched at a time by the app, so the total on
disk matters more than any single file.

This is Python rather than an .mjs like the other scripts because rendering a
605-page vector PDF needs PyMuPDF, which has no usable equivalent in Node.

Usage:  python scripts/build-duri-pages.py [out_dir] [pdf]
"""

import os
import sys

import fitz

# Page 0 of the PDF is the cover; from there the PDF's page N is the mushaf's
# page N, verified against known openings — index 50 is Aal-Imran, which
# begins on mushaf page 50.
FIRST_MUSHAF_PAGE = 1
LAST_MUSHAF_PAGE = 604

WIDTH = 850
QUALITY = 80

DEFAULT_PDF = os.path.expanduser(
    "~/Downloads/quran-douri-mushaf_260822_162138.pdf"
)


def main() -> int:
    out_dir = sys.argv[1] if len(sys.argv) > 1 else "public/duri"
    pdf_path = sys.argv[2] if len(sys.argv) > 2 else DEFAULT_PDF

    if not os.path.exists(pdf_path):
        print(f"source not found: {pdf_path}", file=sys.stderr)
        return 1

    os.makedirs(out_dir, exist_ok=True)
    doc = fitz.open(pdf_path)

    if doc.page_count <= LAST_MUSHAF_PAGE:
        print(
            f"expected more than {LAST_MUSHAF_PAGE} pages, found {doc.page_count}",
            file=sys.stderr,
        )
        return 1

    total = 0
    for page_no in range(FIRST_MUSHAF_PAGE, LAST_MUSHAF_PAGE + 1):
        page = doc[page_no]
        zoom = WIDTH / page.rect.width
        pix = page.get_pixmap(
            matrix=fitz.Matrix(zoom, zoom), colorspace=fitz.csGRAY
        )
        out = os.path.join(out_dir, f"{page_no:03d}.webp")
        pix.pil_save(out, format="WEBP", quality=QUALITY, method=4)
        total += os.path.getsize(out)
        if page_no % 100 == 0:
            print(f"  {page_no}/{LAST_MUSHAF_PAGE}")

    doc.close()
    pages = LAST_MUSHAF_PAGE - FIRST_MUSHAF_PAGE + 1
    print(f"wrote {pages} pages to {out_dir}")
    print(f"total {total / 1e6:.1f} MB, average {total / pages / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
