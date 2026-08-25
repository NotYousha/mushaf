import { describe, it, expect } from 'vitest'
import catalog from '../data/catalog.json'
import surahs from '../data/surahs.json'
import imams from '../data/imams.json'
import reciterFrames from '../data/reciter-frames.json'

const reciters = catalog.reciters

describe('bundled data', () => {
  it('has 114 surah metadata entries', () => {
    expect(surahs).toHaveLength(114)
    expect(surahs[17].nameEn).toBe('Al-Kahf')
    expect(surahs[17].ayahs).toBe(110)
  })

  // Asserts that no expected reciter has disappeared, without failing merely
  // because another has been added.
  it.each([
    'dosari',
    'burhaji-nabawi',
    'turki',
    'juhany',
    'sudais',
    'buayjan',
    'afasy',
    'turki-abdulaziz',
  ])('still carries %s', (id) => {
    expect(reciters.find((r) => r.id === id)).toBeDefined()
  })

  // Two different men, and the app has to say which is which. Sharing a
  // family name is exactly how one gets served under the other's face.
  it('keeps the two Al-Turkis apart', () => {
    const badr = reciters.find((r) => r.id === 'turki')!
    const aziz = reciters.find((r) => r.id === 'turki-abdulaziz')!
    expect(badr.name).not.toBe(aziz.name)
    expect(badr.nameEn).not.toBe(aziz.nameEn)
    expect(badr.fullName).not.toBe(aziz.fullName)
    // Badr's portrait must never stand in for Abdulaziz.
    expect(aziz.photo).not.toBe(badr.photo)
  })

  it('gives every reciter a photo field, even when there is no photo', () => {
    for (const r of reciters) {
      expect(Object.prototype.hasOwnProperty.call(r, 'photo')).toBe(true)
    }
  })

  it("routes the Prophet's Mosque mushaf through the CORS proxy", () => {
    const n = reciters.find((r) => r.id === 'burhaji-nabawi')!
    expect(n.surahs.length).toBeGreaterThan(100)
    for (const s of n.surahs) {
      // The origin bucket sends no CORS header and signs URLs with a 7-day
      // expiry, so these must never point straight at it. Audio shipped with
      // the app is same-origin and needs no proxy.
      expect(s.url).toMatch(/(workers\.dev\/b\/\d+\.mp3$|^audio\/)/)
      expect(s.url).not.toMatch(/digitaloceanspaces|X-Amz-Signature/)
    }
  })

  /**
   * Hand-chosen portrait framings, kept in their own file because the catalog
   * is rewritten from the audio sources every week and would throw them away.
   *
   * The risk with a file keyed by id on the side is that an id stops matching
   * — a reciter renamed, a framing kept for one that was removed — and the
   * framing then does nothing at all, silently, which looks exactly like the
   * adjustment never having been made.
   */
  describe('the portrait framings', () => {
    const frames = reciterFrames as Record<
      string,
      { player?: { zoom: number; x: number; y: number }; card?: unknown }
    >

    it('names only reciters that exist', () => {
      for (const id of Object.keys(frames)) {
        expect(
          reciters.find((r) => r.id === id),
          `${id} has a framing but is not in the catalog`,
        ).toBeDefined()
      }
    })

    it('frames only reciters who have a portrait to frame', () => {
      for (const id of Object.keys(frames)) {
        expect(reciters.find((r) => r.id === id)!.photo, id).toBeTruthy()
      }
    })

    // A stored default does nothing but sit there looking like a decision.
    it('stores nothing that is merely the default', () => {
      for (const [id, f] of Object.entries(frames)) {
        expect(Object.keys(f).length, `${id} is empty`).toBeGreaterThan(0)
        for (const [surface, v] of Object.entries(f)) {
          const g = v as { zoom: number; x: number; y: number }
          expect(
            g.zoom === 100 && g.x === 50 && g.y === 50,
            `${id}.${surface} is the default and should be absent`,
          ).toBe(false)
          expect(g.zoom, `${id}.${surface}`).toBeGreaterThanOrEqual(100)
          expect(g.x, `${id}.${surface}`).toBeGreaterThanOrEqual(0)
          expect(g.x, `${id}.${surface}`).toBeLessThanOrEqual(100)
          expect(g.y, `${id}.${surface}`).toBeGreaterThanOrEqual(0)
          expect(g.y, `${id}.${surface}`).toBeLessThanOrEqual(100)
        }
      }
    })
  })

  it('gives every reciter a distinct id and a full name', () => {
    const ids = reciters.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const r of reciters) {
      expect(r.fullName.length).toBeGreaterThan(0)
      expect(r.mushaf.length).toBeGreaterThan(0)
    }
  })

  it('never points at a CORS-blocked host', () => {
    for (const r of reciters) {
      for (const s of r.surahs) {
        expect(s.url).not.toMatch(/altilawat/)
        // Either a remote URL, or a path to audio shipped with the app.
        expect(s.url).toMatch(/^(https:\/\/|audio\/)/)
      }
    }
  })

  it('has no duplicate or out-of-range surah numbers', () => {
    for (const r of reciters) {
      const nums = r.surahs.map((s) => s.surah)
      expect(new Set(nums).size).toBe(nums.length)
      for (const n of nums) {
        expect(n).toBeGreaterThanOrEqual(1)
        expect(n).toBeLessThanOrEqual(114)
      }
    }
  })

  it('gives every surah a positive byte size', () => {
    for (const r of reciters) {
      expect(r.surahs.filter((s) => !s.bytes)).toHaveLength(0)
    }
  })

  // A compilation entry names the imam per surah. Attribution that is present
  // in one script and missing in the other renders as a blank line for half
  // the languages, so both are required together.
  it('gives every attributed surah both scripts', () => {
    for (const r of reciters) {
      for (const s of r.surahs) {
        const e = s as { voice?: string; voiceEn?: string }
        expect(Boolean(e.voice)).toBe(Boolean(e.voiceEn))
        if (e.voice) {
          expect(e.voice.trim().length).toBeGreaterThan(0)
          expect(e.voiceEn!.trim().length).toBeGreaterThan(0)
        }
      }
    }
  })

  // `name` held the surah's Arabic name, which buildView overwrites from
  // surahs.json anyway. It was dead, and a dead `name` beside a live `voice`
  // invites being repurposed by mistake.
  it('no longer carries a dead per-entry name', () => {
    for (const r of reciters) {
      for (const s of r.surahs) {
        expect(Object.prototype.hasOwnProperty.call(s, 'name')).toBe(false)
      }
    }
  })

  // The roster the Haram 1447 compilation attributes against. Its names are
  // the source item's own, not a guess: the archive item lists the seven
  // imams who led that Ramadan.
  describe('the imam roster', () => {
    const roster = imams as Record<string, { name: string; nameEn: string }>

    it('gives every imam both scripts', () => {
      for (const [id, who] of Object.entries(roster)) {
        expect(who.name.trim().length, id).toBeGreaterThan(0)
        expect(who.nameEn.trim().length, id).toBeGreaterThan(0)
      }
    })

    // Where an imam is also a reciter in his own right, the same person must
    // read the same way in the list and in the player.
    it('spells a shared name the way the catalog already does', () => {
      for (const id of ['dosari', 'turki', 'juhany']) {
        const r = reciters.find((x) => x.id === id)!
        expect(roster[id], id).toBeDefined()
        expect(roster[id].name).toBe(r.name)
        expect(roster[id].nameEn).toBe(r.nameEn)
      }
    })
  })

  describe('Al-Dosari — still being recorded', () => {
    const d = reciters.find((r) => r.id === 'dosari')!

    // This mushaf grows as episodes air, so asserting a fixed count would
    // fail CI every time the weekly refresh picks up a new surah — and block
    // the deploy it is meant to trigger. Assert the shape instead.
    it('runs contiguously from surah 1 with no gaps', () => {
      const nums = d.surahs.map((s) => s.surah).sort((a, b) => a - b)
      expect(nums).toEqual(Array.from({ length: nums.length }, (_, i) => i + 1))
      expect(nums.length).toBeGreaterThanOrEqual(37)
      expect(nums.length).toBeLessThanOrEqual(114)
    })

    it('matches its own released count', () => {
      expect(d.released).toBe(d.surahs.length)
    })
  })

  describe('Burhaji', () => {
    const b = reciters.find((r) => r.id === 'burhaji-nabawi')!

    // The source's files around 94-102 hold each other's recitations. Most
    // are recovered by pointing the surah at the file that actually contains
    // it, identified by duration against a reference for this same recording.
    it('recovers remapped surahs from the file that holds them', () => {
      for (const [surah, file] of [[94, 96], [95, 97], [96, 98], [98, 100], [99, 94], [100, 101], [101, 102], [102, 95]]) {
        const e = b.surahs.find((s) => s.surah === surah)
        expect(e, `surah ${surah} should be present`).toBeDefined()
        expect(e!.url).toContain(`/b/${file}.mp3`)
      }
    })

    // Al-Qadr is not in the source collection, so a copy of the same
    // recording ships with the app instead.
    it('is complete, with Al-Qadr served from a local copy', () => {
      expect(b.surahs).toHaveLength(114)
      const qadr = b.surahs.find((s) => s.surah === 97)!
      expect(qadr.url).toBe('audio/burhaji-097.mp3')
    })

    // Az-Zalzala and Al-Qaari'a are two tenths of a second apart, so they
    // were identified by ear rather than by measurement, and count as settled.
    it('treats ear-identified surahs as settled and the rest as needing a check', () => {
      for (const n of [97, 99, 100, 101]) {
        expect(b.surahs.find((s) => s.surah === n)!.verified).toBe(true)
      }
      for (const n of [94, 95, 96, 98, 102]) {
        expect(b.surahs.find((s) => s.surah === n)!.verified).toBe(false)
      }
    })

  })

  /**
   * The two mushafs whose source files are numbered as each other, and the
   * surahs recovered by pointing at the file that actually holds them.
   *
   * These are the only entries allowed to want an ear, and they are named
   * rather than counted: a remap that grows is either a newly found mislabel,
   * which should be a deliberate edit here, or the identification drifting,
   * which is exactly what this test exists to catch.
   */
  const REMAPPED = {
    'burhaji-nabawi': [94, 95, 96, 98, 102],
    // Abdulaziz Al-Turki: two swaps (33/34, 48/49) and a three-cycle (43-45).
    'turki-abdulaziz': [33, 34, 43, 44, 45, 48, 49],
  } as Record<string, number[]>

  /**
   * As-Sudais's mushaf has a hole in it, and the hole is the point.
   *
   * The Saudi Center has not aired al-A'raf. An index built on a link's
   * position rather than its name would have filled that hole by sliding
   * every later surah down one — al-Anfal served as al-A'raf, and wrong all
   * the way to the end. The absence is what proves the index reads names.
   */
  describe('As-Sudais — recorded with a gap', () => {
    const sd = reciters.find((r) => r.id === 'sudais')!

    it('is missing al-A\'raf rather than shifted past it', () => {
      const nums = sd.surahs.map((s) => s.surah).sort((a, b) => a - b)
      expect(nums).not.toContain(7)
      expect(nums.filter((n) => n <= 21)).toEqual([
        1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21,
      ])
    })

    // Al-Anfal is a third the length of al-A'raf, so if the shift had
    // happened this is the entry that would show it.
    it('gives surah 8 its own recording, not al-A\'raf\'s slot', () => {
      expect(sd.surahs.find((s) => s.surah === 8)!.url).toContain('/sd/8.mp3')
    })

    it('says so, rather than looking merely unfinished', () => {
      expect(sd.note).toContain('الأعراف')
    })
  })

  /**
   * Badr Al-Turki, replaced rather than added to.
   *
   * The entry used to carry his 1441 recording as a ~160 kbps transcode. The
   * Saudi Center's own master is a different, slower performance at 256 kbps,
   * so the sizes are not close: al-Baqarah went from about 60 MB to about
   * 240 MB. A floor well above the old figure is what distinguishes "the
   * replacement landed" from "the old files are still being served", which is
   * a thing that already happened once, out of a stale proxy cache.
   */
  it('serves the Saudi Center master for Badr Al-Turki', () => {
    const t = reciters.find((r) => r.id === 'turki')!
    expect(t.surahs).toHaveLength(114)
    const baqarah = t.surahs.find((s) => s.surah === 2)!
    expect(baqarah.bytes).toBeGreaterThan(200_000_000)
  })

  /**
   * Al-Afasy's entry is the Hafs reading of the Ten Readings mushaf, and must
   * carry no riwayah — that field is what makes the app stand its Hafs text,
   * page layout and timings down. Setting it here would needlessly disable
   * them; the wrong reading in the audio would be far worse, which is why the
   * source was pinned to Hafs before it was catalogued at all.
   */
  it('treats al-Afasy as Hafs, with the project named', () => {
    const af = reciters.find((r) => r.id === 'afasy')!
    expect(af.surahs).toHaveLength(114)
    expect((af as { riwayah?: string }).riwayah).toBeUndefined()
    expect(af.mushaf).toContain('حفص عن عاصم')
    expect(af.mushafEn).toContain('Hafs')
  })

  it('asks for an ear check only where something is genuinely unproven', () => {
    for (const r of reciters) {
      const unverified = r.surahs
        .filter((s) => !s.verified)
        .map((s) => s.surah)
        .sort((a, b) => a - b)
      if (REMAPPED[r.id]) {
        // Identified by duration rather than by the source, so an ear
        // settles them.
        expect(unverified, r.id).toEqual(REMAPPED[r.id])
      } else {
        // Everything else is resolved from its own source page, so the
        // name-to-audio association comes from the source, not a guess.
        expect(unverified, r.id).toHaveLength(0)
      }
    }
  })

  /**
   * A remapped surah must actually be fetched from another surah's file.
   *
   * Asserted because the remap is the whole correction: if it silently
   * stopped being applied, every one of these would play the wrong surah
   * while still being flagged as merely needing a check.
   */
  it('fetches each remapped surah from the file that holds it', () => {
    const az = reciters.find((r) => r.id === 'turki-abdulaziz')!
    for (const [surah, file] of [[33, 34], [34, 33], [43, 45], [44, 43], [45, 44],
                                 [48, 49], [49, 48]]) {
      const e = az.surahs.find((s) => s.surah === surah)
      expect(e, `surah ${surah} should be present`).toBeDefined()
      expect(e!.url).toContain(`/az/${file}.mp3`)
    }
    // And the untouched ones are still themselves.
    for (const surah of [1, 32, 35, 42, 46, 47, 50, 114]) {
      expect(az.surahs.find((s) => s.surah === surah)!.url).toContain(`/az/${surah}.mp3`)
    }
  })
})
