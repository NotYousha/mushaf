"""
Scores the aligner against a reciter whose true timings are already known.

Barhaji's word timings come from the Quranic Universal Audio project and were
verified against our own files, so they are ground truth. Running the aligner
on the same audio and comparing says exactly how far off it is — which is the
only honest way to decide whether the same pipeline can be trusted on
Al-Dosari, where there is nothing to check against.

Usage:  python scripts/align/evaluate.py [surah ...]
"""

import io
import json
import os
import sys
import urllib.request

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segment import align_ayahs, energy_db, speech_span, word_times  # noqa: E402
from words import letters, load_words  # noqa: E402

WORKER = 'https://mushaf-audio.mushaftarteel.workers.dev'
CACHE = os.environ.get('ALIGN_CACHE', os.path.join('.cache', 'align'))

BASMALA = 'بسم الله الرحمن الرحيم'


def fetch(route, surah):
    os.makedirs(CACHE, exist_ok=True)
    # A mosque-year route is two segments — haram/1447 — and the slash would
    # ask for a subdirectory nobody made. Flattened, so a Taraweeh year can be
    # aligned with the same command as a reciter.
    path = os.path.join(CACHE, f"{route.replace('/', '-')}{surah}.mp3")
    if not os.path.exists(path):
        req = urllib.request.Request(
            f'{WORKER}/{route}/{surah}.mp3', headers={'User-Agent': 'Mozilla/5.0'}
        )
        with urllib.request.urlopen(req, timeout=900) as r, open(path, 'wb') as f:
            f.write(r.read())
    return path


def load_text():
    return load_words()


def align_surah(path, surah, words):
    """Predicted per-ayah word start times, in seconds."""
    ayahs = words[surah]
    per_ayah = [ayahs[a] for a in sorted(ayahs)]
    weights = [sum(letters(w) for w in ws) for ws in per_ayah]

    # Every surah but Al-Fatiha and At-Tawba is preceded by the basmala, which
    # is recited but is not one of the surah's own words — in Al-Fatiha it is
    # ayah 1 and so already in the inventory, and At-Tawba has none.
    lead = 0.0 if surah in (1, 9) else float(letters(BASMALA))

    db, frame_s = energy_db(path)
    frames = align_ayahs(db, frame_s, weights, lead_weight=lead)
    starts = [f * frame_s for f in frames]
    _, hi = speech_span(db, frame_s=frame_s)
    ends = starts[1:] + [hi * frame_s]

    out = []
    for ws, s, e in zip(per_ayah, starts, ends):
        out.append(word_times(s, e, [letters(w) for w in ws]))
    return out


def main():
    surahs = [int(a) for a in sys.argv[1:]] or [112, 93, 78, 67, 36]
    text = load_text()
    truth = json.load(io.open('data/timings-burhaji-nabawi.json', encoding='utf-8'))

    print(f'{"surah":>6} {"ayahs":>6} {"ayah med":>9} {"ayah p90":>9} '
          f'{"word med":>9} {"word p90":>9}')
    all_a, all_w = [], []
    for s in surahs:
        pred = align_surah(fetch('b', s), s, text)
        ref = truth['surahs'][str(s)]
        if len(pred) != len(ref):
            print(f'{s:>6} ayah count {len(pred)} vs {len(ref)} — skipped')
            continue
        a_err, w_err = [], []
        for (ayah, ref_starts), p in zip(ref, pred):
            a_err.append(abs(p[0] - ref_starts[0] / 1000))
            for i in range(min(len(p), len(ref_starts))):
                w_err.append(abs(p[i] - ref_starts[i] / 1000))
        all_a += a_err
        all_w += w_err
        print(f'{s:>6} {len(ref):>6} {np.median(a_err):>8.2f}s '
              f'{np.percentile(a_err,90):>8.2f}s {np.median(w_err):>8.2f}s '
              f'{np.percentile(w_err,90):>8.2f}s')

    if all_a:
        print(f'\noverall  ayah median {np.median(all_a):.2f}s  '
              f'p90 {np.percentile(all_a,90):.2f}s')
        print(f'         word median {np.median(all_w):.2f}s  '
              f'p90 {np.percentile(all_w,90):.2f}s')


if __name__ == '__main__':
    main()
