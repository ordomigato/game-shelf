import { describe, expect, it, vi } from 'vitest'
import type { FieldDefinition } from '../../shared/types/collection'
import { LIMIT_REACHED } from '../../shared/utils/plans'
import { checkItemValues } from './collections'
import { validValues } from './import'

// Nitro auto-imports this in the server.
vi.stubGlobal('LIMIT_REACHED', LIMIT_REACHED)

const fields: FieldDefinition[] = [
  { id: 'note', name: 'Note', type: 'text' },
  { id: 'hours', name: 'Hours', type: 'number' },
]
const text = (length: number) => 'x'.repeat(length)

function failure(run: () => unknown) {
  try {
    run()
  } catch (error) {
    return error as { statusCode: number; data: unknown }
  }
  return null
}

describe('checkItemValues', () => {
  it('saves text up to the limit', () => {
    expect(checkItemValues({}, fields, { note: text(500) }, 500)).toEqual({
      note: text(500),
    })
    expect(checkItemValues({}, fields, { note: text(2000) }, 2000)).toEqual({
      note: text(2000),
    })
  })

  it('answers 403 with the limit for text that is too long', () => {
    const error = failure(() =>
      checkItemValues({}, fields, { note: text(501) }, 500),
    )
    expect(error?.statusCode).toBe(403)
    expect(error?.data).toEqual({
      key: 'limits.reached.textLength',
      params: { limit: 500 },
    })
    expect(
      failure(() => checkItemValues({}, fields, { note: text(2001) }, 2000))
        ?.statusCode,
    ).toBe(403)
  })

  it('answers 400 for other bad values', () => {
    const error = failure(() =>
      checkItemValues({}, fields, { hours: 'lots' }, 500),
    )
    expect(error?.statusCode).toBe(400)
    expect(error?.data).toEqual({ invalidFieldIds: ['hours'] })
    expect(
      failure(() => checkItemValues({}, fields, { note: 5 }, 500))?.statusCode,
    ).toBe(400)
    expect(
      failure(() => checkItemValues({}, fields, { nope: 'x' }, 500))
        ?.statusCode,
    ).toBe(400)
  })
})

describe('import values', () => {
  const values = { note: text(600), hours: 4 }

  it('rejects text past the Free limit and counts it', () => {
    expect(validValues(fields, values, 500)).toEqual({
      valid: { hours: 4 },
      rejected: 1,
    })
  })

  it('takes the same text on Pro', () => {
    expect(validValues(fields, values, 2000)).toEqual({
      valid: values,
      rejected: 0,
    })
    expect(validValues(fields, { note: text(2001) }, 2000).rejected).toBe(1)
  })
})
