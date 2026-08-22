"""
Builds data/timings-<reciter>.json by aligning a recitation to the text.

Same output shape as the Quranic Universal Audio export the Barhaji timings
came from — per-surah, per-ayah word start times in milliseconds — so the app
reads both without knowing which is which.

Alignment is slow on a CPU: roughly real time, so a full mushaf is a day or
more of compute. The job is therefore resumable. Each surah is written to its
own file under .cache/timings/<reciter>/ as it finishes, and the final JSON is
assembled from whatever is present, so it can be stopped and restarted
without losing work and can publish partial coverage.

Usage:
  python scripts/align/build.py <reciter> <route> [surah ...]
  python scripts/align/build.py dosari d 78 79 80
  python scripts/align/build.py dosari d           # everything in the catalog
"""

import io
import json
import os
import sys
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ctc import align_words, read_audio  # noqa: E402
from evaluate import BASMALA, fetch  # noqa: E402
from words import load_words  # noqa: E402

PART_DIR = os.path.join('.cache', 'timings')


def align_surah(path, surah, words):
    """Per-ayah word start times in ms."""
    ayahs = words[surah]
    order = sorted(ayahs)
    flat, index = [], []
    for a in order:
        for i, w in enumerate(ayahs[a]):
            flat.append(w)
            index.append((a, i))
    # The basmala is recited before every surah but Al-Fatiha, where it is
    # ayah 1 already, and At-Tawba, which has none. Aligning it explicitly
    # keeps it from being charged to the surah's first words.
    lead = [] if surah in (1, 9) else BASMALA.split()
    times = align_words(read_audio(path), lead + flat)[len(lead):]

    out = {}
    for (a, i), t in zip(index, times):
        out.setdefault(a, []).append(int(round(t * 1000)))
    # A forced path is monotonic in tokens but a dropped word inherits the
    # previous time, so clamp to non-decreasing for safety downstream.
    for a in out:
        run = 0
        for i, v in enumerate(out[a]):
            run = max(run, v)
            out[a][i] = run
    return out


def catalog_surahs(reciter):
    cat = json.load(io.open('data/catalog.json', encoding='utf-8'))
    for r in cat['reciters']:
        if r['id'] == reciter:
            return [s['surah'] for s in r['surahs']]
    raise SystemExit(f'no reciter {reciter} in the catalog')


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    reciter, route = sys.argv[1], sys.argv[2]
    wanted = [int(a) for a in sys.argv[3:]] or catalog_surahs(reciter)

    words = load_words()
    part_dir = os.path.join(PART_DIR, reciter)
    os.makedirs(part_dir, exist_ok=True)

    for surah in wanted:
        part = os.path.join(part_dir, f'{surah:03d}.json')
        if os.path.exists(part):
            continue
        t0 = time.time()
        try:
            path = fetch(route, surah)
            result = align_surah(path, surah, words)
        except Exception as e:  # noqa: BLE001
            print(f'  {surah}: FAILED {e}', flush=True)
            continue
        json.dump(result, io.open(part, 'w', encoding='utf-8'))
        print(f'  {surah}: {len(result)} ayahs in {time.time() - t0:.0f}s', flush=True)

    surahs = {}
    for name in sorted(os.listdir(part_dir)):
        if not name.endswith('.json'):
            continue
        n = int(name[:-5])
        data = json.load(io.open(os.path.join(part_dir, name), encoding='utf-8'))
        surahs[str(n)] = [[int(a), v] for a, v in sorted(data.items(), key=lambda kv: int(kv[0]))]

    out = f'data/timings-{reciter}.json'
    json.dump(
        {
            'unit': 'ms',
            'source': 'forced alignment (wav2vec2 CTC) against the Uthmani text',
            'surahs': surahs,
        },
        io.open(out, 'w', encoding='utf-8'),
        ensure_ascii=False,
    )
    size = os.path.getsize(out)
    print(f'wrote {out}: {len(surahs)} surahs, {size / 1024:.0f} KB')


if __name__ == '__main__':
    main()
