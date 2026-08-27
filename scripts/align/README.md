# Forced alignment — what it costs, and how to run it

`build.py` aligns a recitation to the Uthmani text and writes
`data/timings-<reciter>.json`, the same shape the Quranic Universal Audio
export uses. That file is what gives the app word-by-word highlighting, Talqeen
and the Fork Drill.

## The cost is the whole story

Alignment runs at roughly **real time on a CPU**, and this is a CPU-only
toolchain — `torch` here is a `+cpu` build with no CUDA, on two threads.
Measured on this machine: **50.6 seconds of compute per megabyte of audio.**

That turns into:

| job | audio | compute |
|---|---|---|
| one short surah (al-Fatihah) | 0.7 MB | ~1 minute |
| Al-Mursalat, 50 ayahs | 7 MB | ~6.5 minutes |
| Al-Dosari, the 76 surahs still missing | 2.14 GB | **~32 hours** |
| every reciter in the catalog | 35.2 GB | **~22 days** |
| one Taraweeh year, one mosque | ~1.5 GB | ~21 hours |

So "align everything" is not a command anyone runs; it is a fortnight of a
machine's life. What makes it tractable is that the job is **resumable** and
publishes **partial coverage**, and that coverage is useful the moment it
exists — `timingGranularity` answers per surah, so a reciter timed for juz 30
follows the words there and simply says nothing elsewhere.

A CUDA GPU would cut this by roughly an order of magnitude, and is the only
thing that makes the full catalogue a realistic goal.

## Running it

```
npm run align -- <reciter> <route> [surah ...]
```

The reciter id and route are the ones in `scripts/refresh-catalog.mjs`.

```
npm run align -- dosari d 78 79 80     # three surahs
npm run align -- dosari d              # everything the catalog has
npm run align -- ghilan gh             # a different reciter
```

Each surah is cached under `.cache/timings/<reciter>/` as it finishes and the
JSON is reassembled from whatever is present, so the job can be stopped with
Ctrl-C and restarted without losing work.

**Order matters more than it looks.** Passing the surahs shortest-first means
coverage grows fastest per hour spent, which matters when the job will be
interrupted long before it finishes:

```
node -e "const c=require('./data/catalog.json'),t=require('./data/timings-dosari.json');
const done=new Set(Object.keys(t.surahs).map(Number));
console.log(c.reciters.find(r=>r.id==='dosari').surahs
  .filter(s=>!done.has(s.surah)).sort((a,b)=>a.bytes-b.bytes)
  .map(s=>s.surah).join(' '))"
```

## Taraweeh years

A mosque-year is a route of two segments, and it aligns like any other:

```
npm run align -- haram-1447 haram/1447
npm run align -- nabawi-1446 nabawi/1446
```

Both `haram/{year}` and `nabawi/{year}` resolve for 1446 and 1447.

Two things to know before shipping one. `tests/granularity.test.ts` refuses
timings for any Taraweeh compilation that came from outside — the rule is that
the only permitted route is our own alignment, **with its provenance written
down**, so a new entry needs the test updated and the `source` field filled in
honestly. And Taraweeh is a rotating imam: the timings belong to that year's
recording and to nothing else, exactly as they belong to one reciter's
recording elsewhere.
