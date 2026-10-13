import { describe, expect, it } from 'vitest'
import { collectionColour, COLOUR_PRESETS, inkOn } from './collection-colour'
import { generatedCoverColors } from './generated-cover'

describe('collectionColour', () => {
  it('uses the picked hex code', () => {
    expect(collectionColour({ title: 'NES', color: '#7c3aed' })).toBe('#7c3aed')
  })

  it('falls back to a colour from the title', () => {
    expect(collectionColour({ title: 'NES', color: null })).toBe(
      generatedCoverColors('NES').from,
    )
  })

  it('ignores anything that is not a hex code', () => {
    expect(collectionColour({ title: 'NES', color: 'teal' })).toBe(
      generatedCoverColors('NES').from,
    )
  })
})

describe('inkOn', () => {
  it('picks black on light colours and white on dark ones', () => {
    expect(inkOn('#ffffff')).toBe('#000000')
    expect(inkOn('#facc15')).toBe('#000000')
    expect(inkOn('#000000')).toBe('#ffffff')
    expect(inkOn('#1e3a8a')).toBe('#ffffff')
  })
})

describe('COLOUR_PRESETS', () => {
  it('are all lowercase hex codes, as stored', () => {
    for (const { hex } of COLOUR_PRESETS) expect(hex).toMatch(/^#[0-9a-f]{6}$/)
  })
})
