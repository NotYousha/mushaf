"""
The word inventory the app actually highlights.

Words come from the mushaf layout rather than from `quran-text.json`, for two
reasons. The layout is keyed `surah:ayah:word`, which is exactly what the
renderer and the timings address, so counts cannot drift apart. And the two
sources disagree about the basmala: the text file prepends it to ayah 1 of
every surah, while the printed page treats it as a heading and starts ayah 1
at the first word proper. Aligning against the text file therefore charged the
basmala twice and pushed every boundary late.
"""

import io
import json

_LETTERS = set('ابتثجحخدذرزسشصضطظعغفقكلمنهويىءأإآؤئةٱ')


def letters(text: str) -> int:
    return sum(1 for ch in text if ch in _LETTERS)


def load_words(path='data/mushaf-layout.json'):
    """surah -> ayah -> [word text], in recitation order."""
    layout = json.load(io.open(path, encoding='utf-8'))
    out: dict[int, dict[int, list[str]]] = {}
    for page in layout['pages']:
        for line in page:
            for w in line['w']:
                key = w[1] if len(w) > 1 else None
                if not key:
                    continue
                s, a, i = (int(x) for x in key.split(':'))
                ayahs = out.setdefault(s, {})
                words = ayahs.setdefault(a, [])
                # Keys run 1..n within an ayah and the layout visits them in
                # order, but a word can be split across a line break, so index
                # rather than append.
                while len(words) < i:
                    words.append('')
                words[i - 1] = w[0]
    return out
