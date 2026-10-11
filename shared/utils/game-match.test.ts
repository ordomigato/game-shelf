import { describe, expect, it } from 'vitest'
import type { GameSummary } from '../types/game'
import { normalizeTitle, pickMatch } from './game-match'

const game = (id: number, name: string): GameSummary => ({
  id,
  name,
  coverId: null,
  year: null,
  platforms: [],
})

describe('normalizeTitle', () => {
  it('ignores case, punctuation, accents and a leading "the"', () => {
    expect(normalizeTitle('The Legend of Zelda: Ocarina of Time')).toBe(
      normalizeTitle('legend of zelda ocarina of time'),
    )
    expect(normalizeTitle('Pokémon Red')).toBe('pokemon red')
    expect(normalizeTitle("Tom Clancy's Splinter Cell")).toBe(
      'tom clancy s splinter cell',
    )
  })

  it('ignores "&" and "and", and reads Roman numerals as digits', () => {
    expect(normalizeTitle('Banjo & Kazooie')).toBe(
      normalizeTitle('Banjo-Kazooie'),
    )
    expect(normalizeTitle('Ratchet and Clank')).toBe(
      normalizeTitle('Ratchet & Clank'),
    )
    expect(normalizeTitle('Final Fantasy III')).toBe(
      normalizeTitle('Final Fantasy 3'),
    )
  })
})

describe('pickMatch', () => {
  it('prefers a game with the same title, wherever it ranked', () => {
    const match = pickMatch('super metroid', [
      game(1, 'Metroid Prime'),
      game(2, 'Super Metroid'),
    ])
    expect(match.confidence).toBe('exact')
    expect(match.suggestion).toBe(2)
    expect(match.candidates.map((candidate) => candidate.id)).toEqual([2, 1])
  })

  it('suggests the top result to check when no title matches', () => {
    const match = pickMatch('zelda 1', [
      game(1, 'The Legend of Zelda'),
      game(2, 'Zelda II'),
    ])
    expect(match).toMatchObject({ confidence: 'close', suggestion: 1 })
  })

  it('has nothing to suggest with no results', () => {
    expect(pickMatch('My Homebrew', [])).toEqual({
      name: 'My Homebrew',
      confidence: 'none',
      suggestion: null,
      candidates: [],
    })
  })
})
