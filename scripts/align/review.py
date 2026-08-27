"""
Flags the verses a forced alignment probably got wrong, without ground truth.

The aligner is right almost all of the time and badly wrong occasionally, and
the occasional case is the one that matters: a verse highlighted twelve
seconds from where it is recited is a worse experience than no highlight at
all. On Al-Dosari there is nothing to check the output against, which is the
whole reason `scripts/align` exists, so the check has to come from the audio.

It comes from silence. `gaps.py` measures that picking verse boundaries out of
the energy envelope alone is not accurate enough to *produce* timings — it
slips a pause and everything after it is a verse out. But it is an entirely
independent witness to where the pauses are, and that makes it an excellent
way to *audit* timings the model produced.

Measured on Barhaji's surah 78, where the true verse times are known:

    verses the aligner got within a second (33)   median 0.02 s from a pause
    verses the aligner got wrong (7)              median 1.15 s from a pause

Flagging anything further than 0.3 s from the end of a silence run catches
five of the seven wrong verses — including the twelve-second one — and raises
zero false alarms against the thirty-three correct ones. The two it misses are
both about a second out, because the aligner landed on a real pause, just an
intra-verse breath rather than the verse break; that is the error this check
is blind to by construction, and it is also the error small enough not to
matter at verse granularity.

Usage:
  python scripts/align/review.py dosari d          # every cached part
  python scripts/align/review.py dosari d 112 114
"""

import io
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from evaluate import fetch  # noqa: E402
from gaps import silences  # noqa: E402
from segment import energy_db  # noqa: E402
from words import load_words  # noqa: E402

PART_DIR = os.path.join('.cache', 'timings')
# The distance from a verse start to the nearest resumption of speech, beyond
# which the verse is called suspect. See the numbers in the module docstring.
SUSPECT_S = 0.3


def distances(path, starts):
    """
    How far each verse start sits from the end of the nearest silence run.

    None when the recording holds fewer detectable pauses than it has verses.
    That is an abstention, not a failure: with n verses to corroborate and
    fewer than n pauses to corroborate them with, some verse must come out far
    from a pause no matter how perfect the alignment is, and calling those
    suspect says more about the energy detector than about the timings.

    It happens, and not rarely. Al-Dosari's short surahs are recited without a
    full stop between verses and with enough hall on the recording that the
    breaths never reach the threshold — his Al-Ikhlas has two silence runs in
    twenty-four seconds, both of them the lead-in and the tail.
    """
    db, frame_s = energy_db(path)
    dur = len(db) * frame_s
    cands, _ = silences(db, frame_s)
    # The lead-in and the tail are silence too, and every recording has both.
    # Counting them makes a surah look corroborated when it is not: Al-Dosari's
    # Al-Kafirun has seven silence runs for its six verses, but two of them are
    # the opening and closing quiet and he recites verses one to three straight
    # through, so there are really only five pauses to check six verses with.
    ends = np.array(
        [c[0] * frame_s for c in cands if 1.0 < c[0] * frame_s < dur - 0.2],
        dtype=np.float64,
    )
    if len(ends) < len(starts):
        return None, dur
    d = np.abs(ends[None, :] - np.asarray(starts, dtype=np.float64)[:, None])
    return d.min(axis=1), dur


def main():
    if len(sys.argv) < 3:
        raise SystemExit(__doc__)
    reciter, route = sys.argv[1], sys.argv[2]
    wanted = {int(a) for a in sys.argv[3:]}

    words = load_words()
    part_dir = os.path.join(PART_DIR, reciter)
    if not os.path.isdir(part_dir):
        raise SystemExit(f'nothing aligned for {reciter} yet')

    print(f'{"surah":>5} {"verses":>7} {"suspect":>8} {"median":>8} {"worst":>8}  which')
    total = flagged = 0
    silent = []
    for name in sorted(os.listdir(part_dir)):
        if not name.endswith('.json'):
            continue
        surah = int(name[:-5])
        if wanted and surah not in wanted:
            continue
        part = json.load(io.open(os.path.join(part_dir, name), encoding='utf-8'))
        keys = sorted(part, key=int)
        starts = [part[k][0] / 1000 for k in keys]
        d, _dur = distances(fetch(route, surah), starts)
        if d is None:
            silent.append(surah)
            print(f'{surah:>5} {len(starts):>7} {"—":>8} {"—":>8} {"—":>8}  '
                  f'too few pauses to check')
            continue
        bad = [int(k) for k, x in zip(keys, d) if x > SUSPECT_S]
        total += len(starts)
        flagged += len(bad)
        shown = ', '.join(str(b) for b in bad[:8]) + ('…' if len(bad) > 8 else '')
        print(f'{surah:>5} {len(starts):>7} {len(bad):>8} {np.median(d):>7.2f}s '
              f'{d.max():>7.2f}s  {shown}')

    if total:
        print(f'\n{flagged} of {total} verses suspect ({flagged / total * 100:.1f}%) '
              f'at more than {SUSPECT_S}s from a pause')
    if silent:
        print(f'unchecked, fewer pauses than verses: {silent}')


if __name__ == '__main__':
    main()
