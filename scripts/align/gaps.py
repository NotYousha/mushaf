"""
Verse boundaries from silence alone, seeded by the known ayah count.

The cheap hypothesis this project kept coming back to: a reciter pauses
between verses, we already know how many verses there are, so pick that many
pauses and the job is done for a thousandth of the cost of a speech model.
This is the experiment that tests it, scored against a reciter whose verse
times are already known.

It is a fairer test than `segment.py`, which ranks dips in a smoothed energy
curve and leans hard on a letter-count duration prior. Here silence is the
primary evidence — runs below an adaptive threshold, scored by how long and
how deep they are — and the duration prior only breaks ties.

THE ANSWER IS NO, and the shape of the failure is the interesting part.

Measured against Al-Budair's published verse times over 374 verses in eleven
surahs, after a 180-point grid search over the threshold, the minimum pause
length, the duration tolerance and the silence reward, the best setting reaches
a median error of 0.17 s and puts 77% of verses within a second. The median is
better than the CTC aligner needs to be. The p90 is 6.2 s.

That gap between the median and the p90 is the whole story. This method does
not degrade — it either locks on or slips a pause, and once it has slipped
every verse after it is off by a whole verse. Ar-Rahman came out at 92% within
a second; Al-A'la, nineteen verses and a minute long, came out at 11%, because
Al-Budair breathes mid-verse in it about as often as he stops at the end of
one. Nothing in the energy envelope distinguishes those two silences, and the
duration prior cannot either, because a short verse and a long clause take the
same time to say.

So one verse in four would be seconds wrong with no way to tell which, and a
highlight that is confidently on the wrong verse is worse than no highlight.
`ctc.py` costs about 1.4 s of CPU per second of audio and gets the median to
0.05 s with no tail; this costs about 0.012 s per second of audio, roughly a
hundred times less, and cannot be trusted. Use the model.

Kept because it is a real measurement, and the next person to have this idea
should be able to see the numbers rather than re-derive them.

Usage:
  python scripts/align/gaps.py budair 112 93 78 36
  python scripts/align/gaps.py budair            # a fixed sample of 12
"""

import io
import json
import os
import sys
import time
import urllib.request

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from segment import energy_db  # noqa: E402
from words import letters, load_words  # noqa: E402

CACHE = os.environ.get('ALIGN_CACHE', os.path.join('.cache', 'align'))
BASMALA = 'بسم الله الرحمن الرحيم'
SAMPLE = [112, 108, 103, 97, 93, 87, 78, 67, 55, 36, 19, 2]

_cat = None


def catalog_urls(reciter):
    """surah -> url, straight from the catalog the app itself reads."""
    global _cat
    if _cat is None:
        _cat = json.load(io.open('data/catalog.json', encoding='utf-8'))
    for r in _cat['reciters']:
        if r['id'] == reciter:
            return {s['surah']: s['url'] for s in r['surahs']}
    raise SystemExit(f'no reciter {reciter} in the catalog')


def fetch(reciter, surah):
    """
    Download by catalog URL rather than by worker route.

    `evaluate.fetch` only knows the worker, so it cannot reach the reciters
    whose audio sits on archive.org — Al-Budair among them, who is the one
    reciter with verse times to score against.
    """
    os.makedirs(CACHE, exist_ok=True)
    path = os.path.join(CACHE, f'{reciter}-{surah}.mp3')
    if not os.path.exists(path):
        url = catalog_urls(reciter)[surah]
        req = urllib.request.Request(url, headers={'User-Agent': 'Mozilla/5.0'})
        with urllib.request.urlopen(req, timeout=900) as r, open(path, 'wb') as f:
            f.write(r.read())
    return path


def silences(db, frame_s, alpha=0.55, min_s=0.10, smooth_s=0.06):
    """
    Runs quiet enough to be a pause: (end_frame, score).

    The threshold is a fraction of the way from the loud level down to the
    quiet one rather than a fixed number of dB, because the range between
    speech and pause is nothing like constant across these recordings: it is
    over 20 dB on a close studio murattal and under 8 dB on a reverberant
    mosque one.

    The candidate is the frame the silence *ends* on, since a verse begins
    where speech resumes, not where the previous one stopped.
    """
    k = max(1, int(smooth_s / frame_s))
    s = np.convolve(db, np.ones(k, dtype=np.float32) / k, mode='same')
    lo, hi = np.percentile(s, 5), np.percentile(s, 95)
    thr = hi - alpha * (hi - lo)
    quiet = s < thr
    out = []
    i, n = 0, len(quiet)
    while i < n:
        if not quiet[i]:
            i += 1
            continue
        j = i
        while j < n and quiet[j]:
            j += 1
        span = (j - i) * frame_s
        if span >= min_s:
            depth = max(0.0, float(thr - s[i:j].min()))
            # Length matters more than depth: a long shallow pause is a verse
            # break, a short deep one is a stop consonant.
            out.append((j, span * (1.0 + 0.05 * depth)))
        i = j
    return out, s


def choose(cands, n_seg, expect, frame_s, total_frames, tol_s=2.0, gain=6.0):
    """
    Pick `n_seg - 1` boundaries out of `cands` by dynamic programming.

    `expect[j]` is how long segment j should run if the recitation kept to the
    text's letter counts. The cost of a segment is how far its length strays
    from that, in units of `tol_s`; the reward for a boundary is the silence
    score there. The prior is deliberately loose — it exists to stop the search
    collapsing several verses into one pause, not to decide where the pause is.

    The defaults here are the best of a 180-point grid over `alpha`, `min_s`,
    `tol_s` and `gain`; the top dozen settings all land between 73% and 77% of
    verses within a second, so the ceiling is the method, not the tuning.
    """
    pts = [0] + [c[0] for c in cands] + [total_frames - 1]
    score = [0.0] + [c[1] for c in cands] + [0.0]
    C = len(pts)
    if C < n_seg + 1:
        return None
    pos = np.array(pts, dtype=np.float32) * frame_s
    bonus = gain * np.log1p(np.array(score, dtype=np.float32))
    INF = np.float32(1e12)
    forward = pos[None, :] > pos[:, None]
    dp = np.full(C, INF, dtype=np.float32)
    dp[0] = 0.0
    back = np.zeros((n_seg, C), dtype=np.int32)
    for j in range(n_seg):
        gap = pos[None, :] - pos[:, None]
        cost = ((gap - expect[j]) / tol_s) ** 2
        cost = np.where(forward, cost, INF)
        total = dp[:, None] + cost
        arg = np.argmin(total, axis=0)
        dp = (total[arg, np.arange(C)] - bonus).astype(np.float32)
        back[j] = arg
    c = C - 1
    cuts = []
    for j in range(n_seg - 1, -1, -1):
        c = int(back[j, c])
        cuts.append(c)
    cuts.reverse()
    return [float(pos[i]) for i in cuts]


def predict(path, surah, words, **kw):
    """Verse start times in seconds, or None if there were too few pauses."""
    ayahs = words[surah]
    per = [ayahs[a] for a in sorted(ayahs)]
    w = [float(sum(letters(x) for x in ws)) for ws in per]
    lead = 0.0 if surah in (1, 9) else float(letters(BASMALA))
    segs = ([lead] if lead else []) + w

    db, fs = energy_db(path)
    cands, _ = silences(db, fs, **kw)
    total = len(db) * fs
    a = np.asarray(segs, dtype=np.float32)
    # Most of the clock follows letter count; the rest is split evenly as the
    # pause every verse ends in, which is the split segment.py settled on.
    expect = a / a.sum() * total * 0.82 + total * 0.18 / len(a)
    starts = choose(cands, len(segs), expect, fs, len(db))
    if starts is None:
        return None
    return starts[1:] if lead else starts


def main():
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    reciter = sys.argv[1]
    surahs = [int(a) for a in sys.argv[2:]] or SAMPLE
    truth = json.load(io.open(f'data/timings-{reciter}.json', encoding='utf-8'))
    words = load_words()
    print(f'{"surah":>5} {"ayahs":>6} {"audio":>7} {"med":>7} {"p90":>7} {"max":>7} '
          f'{"<1s":>5} {"secs":>6}')
    every = []
    for s in surahs:
        path = fetch(reciter, s)
        t0 = time.time()
        pred = predict(path, s, words)
        el = time.time() - t0
        ref = [v[1][0] / 1000 for v in truth['surahs'][str(s)]]
        if pred is None or len(pred) != len(ref):
            print(f'{s:>5} not enough pauses for {len(ref)} verses — SKIPPED')
            continue
        e = np.abs(np.array(pred) - np.array(ref))
        every += list(e)
        print(f'{s:>5} {len(e):>6} {ref[-1]:>6.0f}s {np.median(e):>6.2f}s '
              f'{np.percentile(e, 90):>6.2f}s {e.max():>6.1f}s '
              f'{(e < 1).mean() * 100:>4.0f}% {el:>5.1f}s')
    if every:
        e = np.array(every)
        print(f'\nOVERALL {len(e)} verses  median {np.median(e):.2f}s  '
              f'p90 {np.percentile(e, 90):.2f}s  max {e.max():.1f}s  '
              f'within 1s {(e < 1).mean() * 100:.1f}%  '
              f'within 2s {(e < 2).mean() * 100:.1f}%')


if __name__ == '__main__':
    main()
