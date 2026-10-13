import { describe, expect, it } from 'vitest'
import { collectionColour, presetColour } from './collection-colour'
import { generatedCoverColors } from './generated-cover'

describe('collectionColour', () => {
  it('uses the picked preset', () => {
    expect(collectionColour({ title: 'NES', color: 'blue' })).toBe(
      presetColour('blue'),
    )
  })

  it('falls back to a colour from the title', () => {
    expect(collectionColour({ title: 'NES', color: null })).toBe(
      generatedCoverColors('NES').from,
    )
  })
})
