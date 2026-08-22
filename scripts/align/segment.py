"""
Ayah-level alignment of a recitation to the Quran text, without a speech model.

Two facts make this tractable on a laptop with no GPU. A reciter pauses
between ayahs, so the boundaries sit in dips in the energy. And the text says
roughly how long each ayah should take, since time per letter is close to
constant within one reading. Neither is reliable alone — a breath inside a
long ayah looks like a boundary, and elongation makes any single ayah run long
— but together they pin each other down: choose the dips that make the ayah
durations match the text.

The search is a dynamic program over candidate dips, so it finds the globally
best set of boundaries rather than greedily taking the deepest, which picks
several in the quiet opening and none later.

The cost is charged on each ayah's *duration*, not on where its boundary falls
in the file. Charging position instead makes a single slow passage poison
everything after it: the recitation is permanently behind where the text says
it should be, and the error grows to tens of seconds by the end of a long
surah. Charging duration lets a slow passage cost once and be forgotten.

Word times within an ayah are then placed in proportion to letter count. That
is an approximation, and `evaluate.py` measures exactly how good it is against
a reciter whose true word timings are known.
"""

import numpy as np
import soundfile as sf


def energy_db(path, target_sr=8000, hop_ms=10, win_ms=30):
    """Short-time energy in dB, and the seconds one frame covers."""
    data, sr = sf.read(path, dtype='float32', always_2d=True)
    x = data.mean(axis=1)
    # Decimation rather than a resampler: only the envelope matters here, and
    # any aliasing it introduces is far below the level of a pause.
    step = max(1, int(round(sr / target_sr)))
    x = x[::step]
    sr = sr / step
    hop = int(sr * hop_ms / 1000)
    win = int(sr * win_ms / 1000)
    n = (len(x) - win) // hop
    if n <= 0:
        raise ValueError('audio too short')
    idx = np.arange(n) * hop
    frames = np.lib.stride_tricks.sliding_window_view(x, win)[idx]
    e = np.sqrt((frames.astype(np.float32) ** 2).mean(axis=1) + 1e-12)
    return 20 * np.log10(e + 1e-12).astype(np.float32), hop / sr


def _smooth(v, k):
    if k < 2:
        return v
    return np.convolve(v, np.ones(k, dtype=np.float32) / k, mode='same')


def speech_span(db, pad_s=0.3, frame_s=0.01, drop_db=18):
    """
    First and last frame that carry speech.

    Recordings open and close with silence, and some carry a long tail. Left
    in, that tail is time the aligner has to give to the closing ayahs, and
    every boundary stretches to fill it.
    """
    s = _smooth(db, max(1, int(0.15 / frame_s)))
    thr = np.percentile(s, 85) - drop_db
    loud = np.flatnonzero(s > thr)
    if len(loud) == 0:
        return 0, len(db) - 1
    pad = int(pad_s / frame_s)
    return max(0, int(loud[0]) - pad), min(len(db) - 1, int(loud[-1]) + pad)


def candidates(db, frame_s, lo, hi, min_gap_s=0.18, smooth_ms=90, keep=2200):
    """
    Frames that could be a boundary: local dips in smoothed energy.

    Generous on purpose. Precision comes from the duration prior downstream,
    so leaving a true boundary out of this list is the only unrecoverable
    mistake.

    Dips are ranked by how far they fall below their own surroundings, not by
    how quiet they are outright. A pause between two forceful ayahs can sit
    louder than the noise floor of a whole gentle passage, and ranking on
    absolute level throws exactly those away — which is what made long surahs
    drift while short ones came out to within a tenth of a second.
    """
    s = _smooth(db, max(1, int(smooth_ms / 1000 / frame_s)))
    gap = max(1, int(min_gap_s / frame_s))
    win = np.lib.stride_tricks.sliding_window_view(
        np.pad(s, gap, mode='edge'), 2 * gap + 1
    )
    is_min = s <= win.min(axis=1) + 0.01
    idx = np.flatnonzero(is_min)
    idx = idx[(idx > lo) & (idx < hi)]
    if len(idx) > keep:
        span = max(1, int(1.5 / frame_s))
        padded = np.pad(s, span, mode='edge')
        left = np.lib.stride_tricks.sliding_window_view(padded, span)[idx].max(axis=1)
        right = np.lib.stride_tricks.sliding_window_view(padded, span)[
            idx + span + 1
        ].max(axis=1)
        prominence = np.minimum(left, right) - s[idx]
        idx = idx[np.argsort(prominence)[::-1][:keep]]
        idx.sort()
    return idx, s


def align_ayahs(
    db, frame_s, weights, lead_weight=0.0, tol_s=1.2, quiet_w=6.0, pause_frac=0.18
):
    """
    Choose boundary frames so each segment's length follows `weights`.

    `weights` is one number per ayah — letter counts. `lead_weight` covers a
    basmala before the first ayah, which is recited but is not one of the
    surah's own words and would otherwise be swallowed into ayah 1.

    Returns the frame each ayah starts on.
    """
    lo, hi = speech_span(db, frame_s=frame_s)
    cand, s = candidates(db, frame_s, lo, hi)

    segs = ([lead_weight] if lead_weight > 0 else []) + list(weights)
    k = len(segs)
    usable = max(1, hi - lo)
    # Every ayah ends in a pause, and a pause takes about the same time
    # whether the ayah was long or short. Charging time to letters alone
    # therefore starves short ayahs, which is why a forty-ayah surah drifted
    # while a four-ayah one landed within a tenth of a second. `pause_frac` is
    # the share of the recording spent between ayahs rather than reciting.
    letters_part = np.asarray(segs, dtype=np.float32)
    letters_part = letters_part / letters_part.sum() * usable * (1.0 - pause_frac)
    expect = letters_part + (usable * pause_frac / k)

    pts = np.unique(np.concatenate(([lo], cand, [hi]))).astype(np.int64)
    C = len(pts)
    if C < k + 1:
        # Not enough dips to separate every ayah; fall back to pure proportion.
        edges = lo + np.cumsum(np.concatenate(([0], expect)))
        return [int(x) for x in edges[:-1]]

    # Quiet is preferred, but only as a tie-breaker within the tolerance the
    # duration cost allows.
    q_lo, q_hi = np.percentile(s, 5), np.percentile(s, 85)
    quiet = np.clip((s[pts] - q_lo) / max(1e-6, q_hi - q_lo), 0, 1).astype(np.float32)

    tol = max(1.0, tol_s / frame_s)
    INF = np.float32(1e12)
    dp = np.full(C, INF, dtype=np.float32)
    dp[0] = 0.0
    back = np.zeros((k, C), dtype=np.int32)

    pos = pts.astype(np.float32)
    # Only a forward move is legal, so everything on or below the diagonal is
    # excluded once and reused for every segment.
    forward = pos[None, :] > pos[:, None]

    for j in range(k):
        gap = pos[None, :] - pos[:, None]
        cost = ((gap - expect[j]) / tol) ** 2
        cost = np.where(forward, cost, INF)
        total = dp[:, None] + cost
        arg = np.argmin(total, axis=0)
        best = total[arg, np.arange(C)] + quiet_w * quiet
        back[j] = arg
        dp = best.astype(np.float32)

    # The final segment must end where the speech does.
    c = C - 1
    cuts = []
    for j in range(k - 1, -1, -1):
        c = int(back[j, c])
        cuts.append(c)
    cuts.reverse()
    frames = [int(pts[i]) for i in cuts]
    # `frames` holds the start of every segment. Drop the lead-in's, since
    # ayah 1 begins where it ends.
    return frames[1:] if lead_weight > 0 else frames


def word_times(ayah_start_s, ayah_end_s, word_letters):
    """
    Spread an ayah's words across its span in proportion to letter count.

    Crude next to a speech model, but it resynchronises every ayah, so error
    cannot accumulate the way it would across a whole surah.
    """
    total = float(sum(word_letters)) or 1.0
    span = max(0.0, ayah_end_s - ayah_start_s)
    out = []
    at = 0.0
    for w in word_letters:
        out.append(ayah_start_s + span * (at / total))
        at += w
    return out
