import { describe, expect, it } from 'vitest'
import { collectionTitleProblem, slugify } from './slug'

describe('slugify', () => {
  it('makes readable URL names', () => {
    expect(slugify('Zelda: Oracle Games')).toBe('zelda-oracle-games')
    expect(slugify('  Pokémon Red & Blue!! ')).toBe('pokemon-red-blue')
    expect(slugify('N64')).toBe('n64')
  })

  it('treats near-duplicate titles as the same slug', () => {
    expect(slugify('Zelda')).toBe(slugify('zelda!'))
  })

  it('caps the length without leaving a trailing hyphen', () => {
    const slug = slugify(`${'a'.repeat(59)} b`)
    expect(slug.length).toBeLessThanOrEqual(60)
    expect(slug.endsWith('-')).toBe(false)
  })

  it('can be empty', () => {
    expect(slugify('!!!')).toBe('')
    expect(slugify('ゼルダ')).toBe('')
  })
})

describe('collectionTitleProblem', () => {
  it('accepts normal titles', () => {
    expect(collectionTitleProblem('My Zelda games')).toBeNull()
  })

  it('needs a letter or number, and keeps "wishlist" for the Wishlist', () => {
    expect(collectionTitleProblem('!!!')?.key).toBe(
      'collections.problems.noLetters',
    )
    expect(collectionTitleProblem('Wishlist')?.key).toBe(
      'collections.problems.reserved',
    )
  })
})
