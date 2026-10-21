export const SCAN_STORAGE_KEY = 'gameshelf:scan-list'

const SCAN_STATE_KEYS = [
  'scanner-open',
  'scanner-rows',
  'scanner-list',
  'scanner-collection',
  'scanner-into-collection',
  'scanner-highlight',
  'scanner-restored',
]

/**
 * Forgets the scanner's list, in memory and in session storage, so the
 * next person on this browser never sees it. Called when someone signs out.
 */
export function clearScanState() {
  clearNuxtState(SCAN_STATE_KEYS)
  try {
    sessionStorage.removeItem(SCAN_STORAGE_KEY)
  } catch {
    // Nothing was kept.
  }
}
