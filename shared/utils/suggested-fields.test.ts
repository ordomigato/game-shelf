import { describe, expect, it } from 'vitest'
import {
  SUGGESTED_FIELDS,
  availableSuggestions,
  fieldFromSuggestion,
} from './suggested-fields'
import { fieldsProblem } from './field-changes'

describe('fieldFromSuggestion', () => {
  it('gives every field a fresh id each time', () => {
    const ids = [0, 1].flatMap(() =>
      SUGGESTED_FIELDS.map((s) => fieldFromSuggestion(s).id),
    )
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('copies options, so editing one field never changes the suggestion', () => {
    const status = SUGGESTED_FIELDS.find((s) => s.type === 'select')!
    fieldFromSuggestion(status).options!.push('Replaying')
    expect(status.options).not.toContain('Replaying')
  })
})

describe('SUGGESTED_FIELDS', () => {
  it('is a valid set of fields that adds nothing a game already has', () => {
    const fields = SUGGESTED_FIELDS.map((s) => fieldFromSuggestion(s))
    expect(fieldsProblem(fields)).toBeNull()
    const core = ['name', 'year', 'genre', 'platform', 'cover']
    for (const field of fields) {
      expect(core.some((word) => field.name.toLowerCase().includes(word))).toBe(
        false,
      )
    }
  })
})

describe('availableSuggestions', () => {
  it('leaves out names the user already has, ignoring case and spaces', () => {
    const left = availableSuggestions([{ name: ' rating ' }, { name: 'NOTES' }])
    expect(left.map((s) => s.name)).not.toContain('Rating')
    expect(left.map((s) => s.name)).not.toContain('Notes')
    expect(left).toHaveLength(SUGGESTED_FIELDS.length - 2)
  })
})
