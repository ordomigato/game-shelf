import { describe, expect, it } from 'vitest'
import { generatedCoverColors, nameHue } from './generated-cover'

describe('nameHue', () => {
  it('gives the same name the same hue every time', () => {
    expect(nameHue('Chrono Trigger')).toBe(nameHue('Chrono Trigger'))
  })

  it('ignores case and extra spaces', () => {
    expect(nameHue('  chrono   TRIGGER ')).toBe(nameHue('Chrono Trigger'))
  })

  it('stays within 0 to 359', () => {
    for (const name of ['', 'a', 'Zelda', '東方', 'x'.repeat(500)]) {
      const hue = nameHue(name)
      expect(hue).toBeGreaterThanOrEqual(0)
      expect(hue).toBeLessThan(360)
      expect(Number.isInteger(hue)).toBe(true)
    }
  })

  it('spreads similar names apart', () => {
    const hues = new Set(
      ['Mega Man', 'Mega Man 2', 'Mega Man 3', 'Mega Man 4'].map(nameHue),
    )
    expect(hues.size).toBe(4)
  })
})

describe('generatedCoverColors', () => {
  it('uses the name hue for both ends of the gradient', () => {
    const hue = nameHue('Earthbound')
    const { from, to } = generatedCoverColors('Earthbound')
    expect(from).toContain(` ${hue})`)
    expect(to).toContain(` ${hue})`)
  })
})
