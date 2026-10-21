import { describe, expect, it, vi } from 'vitest'
import { clearScanState, SCAN_STORAGE_KEY } from './scan-storage'

describe('clearScanState', () => {
  it('empties the scanner state and its session storage', () => {
    const clearNuxtState = vi.fn()
    const removeItem = vi.fn()
    vi.stubGlobal('clearNuxtState', clearNuxtState)
    vi.stubGlobal('sessionStorage', { removeItem })
    clearScanState()
    expect(clearNuxtState).toHaveBeenCalledWith(
      expect.arrayContaining(['scanner-rows', 'scanner-restored']),
    )
    expect(removeItem).toHaveBeenCalledWith(SCAN_STORAGE_KEY)
  })

  it('still finishes when session storage is blocked', () => {
    vi.stubGlobal('clearNuxtState', vi.fn())
    vi.stubGlobal('sessionStorage', {
      removeItem: () => {
        throw new Error('blocked')
      },
    })
    expect(() => clearScanState()).not.toThrow()
  })
})
