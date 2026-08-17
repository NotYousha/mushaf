import { describe, it, expect } from 'vitest'
import { matchFilename } from '../src/sources/matchFilename'
import surahs from '../data/surahs.json'

describe('matchFilename', () => {
  it('matches zero-padded numbers', () => {
    expect(matchFilename('001.mp3')).toBe(1)
    expect(matchFilename('018.mp3')).toBe(18)
    expect(matchFilename('114.mp3')).toBe(114)
  })

  it('matches bare numbers', () => {
    expect(matchFilename('7.mp3')).toBe(7)
    expect(matchFilename('36.m4a')).toBe(36)
  })

  it('matches numbered titles', () => {
    expect(matchFilename('01 - Al-Fatiha.mp3')).toBe(1)
    expect(matchFilename('18_Al-Kahf.mp3')).toBe(18)
  })

  it('matches English names', () => {
    expect(matchFilename('Al-Kahf.mp3')).toBe(18)
  })

  it('matches Arabic names', () => {
    expect(matchFilename('الكهف.mp3')).toBe(18)
    expect(matchFilename('سورة الكهف.mp3')).toBe(18)
  })

  it('returns null rather than guessing', () => {
    expect(matchFilename('track-unknown.mp3')).toBe(null)
    expect(matchFilename('recording.mp3')).toBe(null)
    expect(matchFilename('0.mp3')).toBe(null)
    expect(matchFilename('115.mp3')).toBe(null)
    expect(matchFilename('')).toBe(null)
  })

  it('round-trips every English name in the dataset', () => {
    for (const s of surahs) {
      expect(matchFilename(`${s.nameEn}.mp3`)).toBe(s.surah)
    }
  })

  it('round-trips every numeric filename', () => {
    for (const s of surahs) {
      expect(matchFilename(`${String(s.surah).padStart(3, '0')}.mp3`)).toBe(s.surah)
    }
  })
})
