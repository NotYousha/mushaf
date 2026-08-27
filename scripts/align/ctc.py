"""
Word-level forced alignment of a recitation to the Quran text.

The energy-and-letter-count approach in `segment.py` gets ayah boundaries
roughly right on a four-ayah surah and drifts by ten seconds on a forty-ayah
one, because time per letter is not constant: `عَمَّ يَتَسَاءَلُونَ` is ten
letters and takes nearly nine seconds. Nothing that ignores the audio's
content can fix that.

So this listens. A CTC acoustic model fine-tuned on Quran recitation gives a
per-frame distribution over Arabic letters; because we already know exactly
what is being recited, the alignment is a forced one — the cheapest path
through the trellis that spells the known text — which is far easier than
recognition and correspondingly more accurate.

Runs on CPU. The model is 94M parameters, which is slow but not impossibly
so, and the result is cached, so the cost is paid once per recording.
"""

import os

import numpy as np
import torch
import torchaudio
import soundfile as sf

MODEL = 'HamzaSidhu786/wav2vec2-base-word-by-word-quran-asr'
SR = 16000
# Dynamic int8 quantisation of the Linear layers. Measured on this project's
# reference machine (Ryzen 3 3250U, 2 cores, no CUDA) against Barhaji's known
# word timings: 1.27 s of wall clock per second of audio in fp32 against
# 0.94 s/s in int8, a 1.35x speedup, with the accuracy unchanged — median word
# error 50 ms against 52 ms, p90 159 ms in both, 92% of words within 300 ms.
# The weights are only ever used to argmax a path through a trellis, so the
# quantisation noise is far below the resolution the timings are read at.
# Set ALIGN_FP32=1 to turn it off.
INT8 = os.environ.get('ALIGN_FP32') != '1'
# Long files are run in windows: emissions are local to their frames, so
# windowing and concatenating gives the same answer as one pass, with bounded
# memory. The overlap is discarded from both sides and only exists so no word
# straddles a seam with half its context missing.
WINDOW_S = 40.0
OVERLAP_S = 2.0

_cache = {}


def load_model():
    if 'm' not in _cache:
        from transformers import AutoModelForCTC, AutoProcessor

        proc = AutoProcessor.from_pretrained(MODEL)
        model = AutoModelForCTC.from_pretrained(MODEL).eval()
        if INT8:
            model = torch.ao.quantization.quantize_dynamic(
                model, {torch.nn.Linear}, dtype=torch.qint8
            )
        # Two physical cores, four threads. Four measured faster than two
        # (0.94 s/s against 1.15 s/s), so take whatever torch defaults to.
        torch.set_num_threads(max(1, torch.get_num_threads()))
        _cache['m'] = (proc, model)
    return _cache['m']


def read_audio(path):
    data, sr = sf.read(path, dtype='float32', always_2d=True)
    x = torch.from_numpy(data.mean(axis=1))
    if sr != SR:
        x = torchaudio.functional.resample(x, sr, SR)
    return x


@torch.inference_mode()
def emissions(x):
    """Log-probabilities per frame, and the seconds one frame covers."""
    proc, model = load_model()
    win = int(WINDOW_S * SR)
    hop = int((WINDOW_S - OVERLAP_S) * SR)
    outs = []
    ratio = None
    for start in range(0, max(1, len(x)), hop):
        chunk = x[start:start + win]
        if len(chunk) < SR // 4:
            break
        feats = proc(chunk.numpy(), sampling_rate=SR, return_tensors='pt')
        logits = model(feats.input_values).logits[0]
        lp = torch.log_softmax(logits, dim=-1)
        if ratio is None:
            ratio = len(chunk) / lp.shape[0]
        # The previous window already covered the whole overlap, so drop all
        # of it. Dropping half leaves the other half duplicated, which
        # stretches the timeline by a second per window — invisible on a short
        # surah and minutes of drift across a long one.
        drop = 0 if start == 0 else int(round(OVERLAP_S * SR / ratio))
        outs.append(lp[drop:])
        if start + win >= len(x):
            break
    return torch.cat(outs, dim=0), ratio / SR


def normalise(text, vocab):
    """Reduce Uthmani orthography to the letters the model was trained on."""
    subs = {'ٱ': 'ا', 'ـ': ''}
    out = []
    for ch in text:
        ch = subs.get(ch, ch)
        if ch and ch in vocab:
            out.append(ch)
    return ''.join(out)


def align_words(x, words):
    """
    Start time of each word, in seconds.

    `words` is the surah's words in order. Anything the model has no token for
    is dropped from the target but still occupies a slot in the result, so the
    caller's indices line up with the mushaf's word keys.
    """
    proc, _ = load_model()
    vocab = proc.tokenizer.get_vocab()
    lp, frame_s = emissions(x)

    tokens, owner = [], []
    for i, w in enumerate(words):
        n = normalise(w, vocab)
        for ch in n:
            tokens.append(vocab[ch])
            owner.append(i)
    if not tokens:
        raise ValueError('nothing to align')

    targets = torch.tensor([tokens], dtype=torch.int32)
    blank = vocab.get('[PAD]', vocab.get('<pad>', 0))
    paths, _scores = torchaudio.functional.forced_align(
        lp.unsqueeze(0), targets, blank=blank
    )
    path = paths[0]

    # The first frame each token is emitted on is where its word begins.
    starts = {}
    t_index = -1
    prev = blank
    for frame, tok in enumerate(path.tolist()):
        if tok == blank:
            prev = blank
            continue
        if tok != prev:
            t_index += 1
            if t_index < len(owner):
                starts.setdefault(owner[t_index], frame)
        prev = tok

    out = []
    last = 0.0
    for i in range(len(words)):
        if i in starts:
            last = starts[i] * frame_s
        out.append(last)
    return out
