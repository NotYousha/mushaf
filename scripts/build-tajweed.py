"""
Builds data/tajweed.json — where the tajweed rules fall, in our own words.

A tajweed mushaf colours letters rather than words: the nun of a hidden
ikhfa, the alif of a lengthened madd. Every published tajweed mushaf is
either a scan or a colour font, and both of those replace our page — a scan
cannot be highlighted word by word or read aloud by a screen reader, and a
glyph font puts the whole Quran in the private use area where it can be
neither searched nor spoken.

So the colour is computed onto the text we already have. Output is one entry
per word, keyed exactly as the page layout keys it:

    {"1:1:2": [["h", 0, 1]], "1:1:3": [["h", 0, 1], ["l", 1, 2]]}

— rule, and the character range inside that word. The renderer splits the word
into coloured runs and the word stays one DOM node, so word highlighting, the
Veil, tap-to-seek and the screen-reader copy all keep working exactly as they
do today. Nothing else in the app has to know this feature exists.

THE HARD PART is that quran.com's tajweed markup sits on Tanzil's text and our
layout comes from the King Fahd Complex's, and the two spell the same Quran
differently in about sixty systematic ways — U+06ED dropped, U+06DF against
U+0652, U+0670 against U+0672, tatweel inserted, a space where there is a
zero-width non-joiner. Reusing the offsets naively puts more than a quarter of
the colours on the wrong letter. So every ayah is character-aligned with
difflib before its spans are projected, and the script refuses to write if the
accuracy drops below what it achieved when it was written.
"""

import json
import re
import sys
from difflib import SequenceMatcher

SRC = ".cache/tajweed.json"
LAYOUT = "data/mushaf-layout.json"
# Served, not bundled. 1.3 MB is worth paying only by the reader who chooses
# the tajweed mushaf, and the service worker keeps it once they have.
OUT = "public/tajweed.json"

# Short codes, because this is written once per rule occurrence and there are
# sixty thousand of them. Long names would double the file.
RULES = {
    "ham_wasl": "h",
    "laam_shamsiyah": "l",
    "madda_normal": "m2",
    "madda_permissible": "m4",
    "madda_necessary": "m6",
    "madda_obligatory": "mo",
    "ghunnah": "g",
    "qalaqah": "q",
    "ikhafa": "n",
    "ikhafa_shafawi": "ns",
    "idgham_ghunnah": "ig",
    "idgham_wo_ghunnah": "iw",
    "idgham_shafawi": "is",
    "idgham_mutajanisayn": "im",
    "idgham_mutaqaribayn": "iq",
    "iqlab": "b",
    "slnt": "s",
}

TAG = re.compile(r"<tajweed class=([a-z_]+)>(.*?)</tajweed>", re.S)
END = re.compile(r"<span class=end>.*?</span>", re.S)


def spans_of(markup):
    """Strip the markup, returning the plain text and (rule, start, end)."""
    markup = END.sub("", markup)
    out = []
    text = []
    at = 0
    pos = 0
    while True:
        m = TAG.search(markup, at)
        if not m:
            text.append(markup[at:])
            break
        text.append(markup[at : m.start()])
        pos += m.start() - at
        inner = m.group(2)
        rule = RULES.get(m.group(1))
        if rule:
            out.append((rule, pos, pos + len(inner)))
        text.append(inner)
        pos += len(inner)
        at = m.end()
    return "".join(text), out


def main():
    verses = json.load(open(SRC, encoding="utf-8"))["verses"]
    layout = json.load(open(LAYOUT, encoding="utf-8"))

    # Our words, per ayah, in order.
    words = {}
    for page in layout["pages"]:
        for line in page:
            for w in line["w"]:
                if len(w) < 2 or not w[1]:
                    continue
                s, a, _ = w[1].split(":")
                words.setdefault(f"{s}:{a}", []).append(w)

    result = {}
    total = mapped = mismatched = 0
    coloured_words = 0

    for verse in verses:
        key = verse["verse_key"]
        ours = words.get(key)
        if not ours:
            print(f"{key}: not in the layout", file=sys.stderr)
            return 1

        theirs, spans = spans_of(verse["text_uthmani_tajweed"])
        total += len(spans)
        if not spans:
            continue

        # Our ayah as one string, and where each word sits inside it.
        bounds = []
        at = 0
        parts = []
        for w in ours:
            text = w[0].strip()
            bounds.append((at, at + len(text), w[1]))
            parts.append(text)
            at += len(text) + 1
        mine = " ".join(parts)

        # Character alignment. The two texts are the same Quran spelled by two
        # different printers, so a projected offset is the only safe one.
        theirs_norm = " ".join(theirs.split())
        matcher = SequenceMatcher(None, theirs_norm, mine, autojunk=False)
        move = {}
        for a, b, size in matcher.get_matching_blocks():
            for i in range(size):
                move[a + i] = b + i

        for rule, start, end in spans:
            here = [move[i] for i in range(start, end) if i in move]
            if not here:
                mismatched += 1
                continue
            lo, hi = min(here), max(here) + 1
            mapped += 1
            # Clip into each word the span touches. A span crossing a word
            # boundary is real — idgham runs between two words — and it is
            # split rather than dropped, so the word nodes stay intact.
            for wstart, wend, wkey in bounds:
                a = max(lo, wstart)
                b = min(hi, wend)
                if a >= b:
                    continue
                result.setdefault(wkey, []).append([rule, a - wstart, b - wstart])

    coloured_words = len(result)
    accuracy = mapped / total if total else 0
    print(f"spans {total}, projected {mapped}, unanchored {mismatched}")
    print(f"anchor accuracy {accuracy:.4%} over {coloured_words} words")

    # The number this achieved when it was written. A drop means the upstream
    # text moved under us, and a tajweed mushaf colouring the wrong letters is
    # worse than one that never shipped.
    if accuracy < 0.995:
        print("accuracy below 99.5% — nothing written", file=sys.stderr)
        return 1

    payload = json.dumps(result, ensure_ascii=False, separators=(",", ":"))
    open(OUT, "w", encoding="utf-8", newline="\n").write(payload)
    print(f"{OUT} — {len(payload) / 1024:.0f} KB")
    return 0


if __name__ == "__main__":
    sys.exit(main())
