"""
Scores the CTC aligner against a reciter whose true timings are known.

Barhaji's word timings come from the Quranic Universal Audio project and were
verified against our own files, so they are ground truth. Running the aligner
on that same audio says exactly how far off it is, which is the only honest
way to decide whether to trust it on Al-Dosari, where there is nothing to
check against.

Usage:  python scripts/align/eval_ctc.py [surah ...]
"""
import io
import json
import os
import sys
import time

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ctc import align_words, read_audio  # noqa: E402
from evaluate import BASMALA, fetch  # noqa: E402
from words import load_words  # noqa: E402


def align_surah(path, surah, words):
    ayahs = words[surah]
    order = sorted(ayahs)
    flat, index = [], []
    for a in order:
        for i, w in enumerate(ayahs[a]):
            flat.append(w)
            index.append((a, i))
    lead = [] if surah in (1, 9) else BASMALA.split()
    times = align_words(read_audio(path), lead + flat)[len(lead):]
    out = {}
    for (a, i), t in zip(index, times):
        out.setdefault(a, []).append(t)
    return out


def main():
    surahs = [int(a) for a in sys.argv[1:]] or [112, 93]
    words = load_words()
    truth = json.load(io.open('data/timings-burhaji-nabawi.json', encoding='utf-8'))
    print(f'{"surah":>6} {"words":>6} {"median":>8} {"p90":>8} {"max":>8} {"speed":>7}')
    every = []
    for s in surahs:
        path = fetch('b', s)
        t0 = time.time()
        pred = align_surah(path, s, words)
        secs = time.time() - t0
        ref = dict(truth['surahs'][str(s)])
        err = []
        for a, times in pred.items():
            r = ref.get(a)
            if not r:
                continue
            for i in range(min(len(times), len(r))):
                err.append(abs(times[i] - r[i] / 1000))
        err = np.array(err)
        every += list(err)
        dur = max(max(v) for v in ref.values()) / 1000
        print(f'{s:>6} {len(err):>6} {np.median(err):>7.3f}s '
              f'{np.percentile(err,90):>7.3f}s {err.max():>7.2f}s '
              f'{dur/secs:>6.2f}x')
    if every:
        e = np.array(every)
        print(f'\noverall {len(e)} words  median {np.median(e):.3f}s  '
              f'p90 {np.percentile(e,90):.3f}s  '
              f'within 0.3s: {(e<0.3).mean()*100:.1f}%')


if __name__ == '__main__':
    main()
