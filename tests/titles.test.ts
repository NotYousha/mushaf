import { describe, it, expect } from 'vitest'
import titles from '../data/titles.json'
import catalog from '../data/catalog.json'
import imams from '../data/imams.json'
import { shortTitle, fullTitle, styled } from '../src/catalog/titles'

/**
 * Honorifics and offices.
 *
 * These name living scholars, and the app prints them against recitations of
 * the Quran. The rule the research followed was to omit anyone who could not
 * be verified rather than guess, so a missing entry is normal — what must not
 * happen is a half-filled one, or one attached to a person who does not exist
 * in this app at all.
 */

const data = titles as Record<string, { short: Record<string, string>; full: Record<string, string>; source?: string }>
const LANGS = ['ar', 'en', 'ur', 'fr', 'hi'] as const

describe('reciter titles', () => {
  it('names only people the app knows', () => {
    const known = new Set([
      ...(catalog as { reciters: { id: string }[] }).reciters.map((r) => r.id),
      ...Object.keys(imams as Record<string, unknown>),
    ])
    for (const id of Object.keys(data)) expect(known.has(id), id).toBe(true)
  })

  it('is complete in every language or not there at all', () => {
    // A title present in English and missing in Urdu would show an English
    // office under an Urdu name, which reads worse than showing none.
    for (const [id, v] of Object.entries(data)) {
      for (const lang of LANGS) {
        expect(v.short?.[lang], `${id}.short.${lang}`).toBeTruthy()
        expect(v.full?.[lang], `${id}.full.${lang}`).toBeTruthy()
      }
    }
  })

  it('carries a source for each, so the next person can check', () => {
    for (const [id, v] of Object.entries(data)) {
      expect(v.source, id).toMatch(/^https?:\/\//)
    }
  })

  it('holds an honorific, not a name', () => {
    // "Sh. Dr." not "Sh. Dr. Yasser Al-Dosari" — the name is joined on at the
    // point of use, and a name baked in here would be printed twice.
    for (const [id, v] of Object.entries(data)) {
      expect(v.short.en.length, id).toBeLessThan(12)
      expect(v.full.en.toLowerCase(), id).not.toContain('al-')
    }
  })

  it('returns null rather than inventing one', () => {
    expect(shortTitle('nobody-at-all', 'en')).toBeNull()
    expect(fullTitle('nobody-at-all', 'en')).toBeNull()
    expect(styled('nobody-at-all', 'en', 'A Name')).toBe('A Name')
  })

  it('puts the honorific in front of the name', () => {
    expect(styled('dosari', 'en', 'Yasser Al-Dosari')).toBe('Sh. Dr. Yasser Al-Dosari')
  })
})
