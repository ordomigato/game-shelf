import type {
  BarcodeMatch,
  BarcodeResult,
  BulkAddResult,
} from '#shared/types/barcode'
import type { ListName } from '#shared/types/collection'
import { MAX_SCAN_BATCH, normalizeBarcode } from '#shared/utils/barcode'
import { SCAN_STORAGE_KEY as STORAGE_KEY } from '~/utils/scan-storage'
import {
  canTick,
  defaultTicked,
  entriesToAdd,
  parseStoredRows,
  pickGame,
  type ScanRow,
} from '~/utils/scan-rows'

/** A refusal that says to wait longer than this is the daily cap. */
const DAILY_CAP_WAIT_SECONDS = 600
/** A refusal asking for less than this is waited out once, automatically. */
const SHORT_WAIT_SECONDS = 10
/** Lookups in flight at once. */
const MAX_LOOKUPS = 3

// Lookups wait here for one of the `MAX_LOOKUPS` places.
let running = 0
const waiting: (() => void)[] = []
async function takePlace() {
  if (running >= MAX_LOOKUPS) {
    await new Promise<void>((resolve) => waiting.push(resolve))
  } else running += 1
}
function givePlace() {
  const next = waiting.shift()
  if (next) next()
  else running -= 1
}

function refusal(error: unknown): { limited: boolean; wait: number } {
  const { status, statusCode, response } = error as {
    status?: number
    statusCode?: number
    response?: { headers?: Headers }
  }
  return {
    limited: (statusCode ?? status) === 429,
    wait: Number(response?.headers?.get('retry-after') ?? 0),
  }
}

/** The collection a scan was started from, which the batch also joins. */
export interface ScanCollection {
  id: string
  title: string
}

export type ScanOutcome = 'added' | 'duplicate' | 'invalid' | 'full'

function readStored(): { rows: ScanRow[]; list: ListName } | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const stored = JSON.parse(raw) as { rows?: unknown; list?: unknown }
    return {
      rows: parseStoredRows(stored.rows),
      list: stored.list === 'wishlist' ? 'wishlist' : 'owned',
    }
  } catch {
    return null
  }
}

function writeStored(rows: ScanRow[], list: ListName) {
  try {
    if (!rows.length) sessionStorage.removeItem(STORAGE_KEY)
    else sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ rows, list }))
  } catch {
    // The list just doesn't survive a reload.
  }
}

/**
 * The barcode scanner's state, shared by every page: whether the scanner is
 * open, the scanned list and where it will be added. Scanning needs a
 * signed-in user (the lookup route requires it). The list is kept in the
 * browser's session storage until it is added or cleared, so closing the
 * scanner by accident loses nothing.
 */
export function useBarcodeScanner() {
  const auth = useAuth()
  const open = useState('scanner-open', () => false)
  const rows = useState<ScanRow[]>('scanner-rows', () => [])
  const list = useState<ListName>('scanner-list', () => 'owned')
  const collection = useState<ScanCollection | null>(
    'scanner-collection',
    () => null,
  )
  const intoCollection = useState('scanner-into-collection', () => true)
  const highlighted = useState<string | null>('scanner-highlight', () => null)
  const restored = useState('scanner-restored', () => false)
  let highlightTimer: ReturnType<typeof setTimeout> | undefined

  const toAdd = computed(() => entriesToAdd(rows.value, list.value))
  const isFull = computed(() => rows.value.length >= MAX_SCAN_BATCH)

  function save() {
    writeStored(
      rows.value.filter(
        (row) => row.status === 'match' || row.status === 'none',
      ),
      list.value,
    )
  }

  /**
   * Opens the scanner. `from` is the page's list and collection: a scan
   * started from a collection also adds to it, and one started from the
   * Wishlist adds to the Wishlist.
   */
  function start(from: { list?: ListName; collection?: ScanCollection } = {}) {
    if (!restored.value) {
      restored.value = true
      const stored = readStored()
      if (stored?.rows.length) {
        rows.value = stored.rows
        list.value = stored.list
      }
    }
    if (from.list && !rows.value.length) list.value = from.list
    collection.value = from.collection ?? null
    intoCollection.value = true
    open.value = true
  }

  function update(code: string, change: Partial<ScanRow>) {
    rows.value = rows.value.map((row) =>
      row.code === code ? { ...row, ...change } : row,
    )
  }

  function highlight(code: string) {
    highlighted.value = code
    clearTimeout(highlightTimer)
    highlightTimer = setTimeout(() => (highlighted.value = null), 1500)
  }

  async function lookup(code: string) {
    await takePlace()
    try {
      const row = rows.value.find((r) => r.code === code)
      const path = `/api/barcodes/${row?.query ?? code}`
      // Asked again by the row's Try again button, not on its own, except
      // once after a short wait when the server asks for one.
      const ask = () => auth.apiFetch<BarcodeResult>(path, { retry: 0 })
      let result: BarcodeResult
      try {
        result = await ask()
      } catch (error) {
        const { limited, wait } = refusal(error)
        if (!limited || wait > SHORT_WAIT_SECONDS) throw error
        await new Promise((resolve) =>
          setTimeout(resolve, Math.max(wait, 1) * 1000),
        )
        result = await ask()
      }
      const { match } = result
      if (!rows.value.some((r) => r.code === code)) return
      update(
        code,
        match
          ? {
              status: 'match',
              match,
              ticked: defaultTicked(match, list.value),
              problem: undefined,
              own: result.own === true,
            }
          : { status: 'none', ticked: false },
      )
    } catch (error) {
      const { limited, wait } = refusal(error)
      update(code, {
        status: 'error',
        ticked: false,
        problem: limited && wait > DAILY_CAP_WAIT_SECONDS ? 'limit' : 'failed',
      })
    } finally {
      givePlace()
    }
    save()
  }

  /**
   * Adds a barcode to the list and looks it up. The same barcode again
   * highlights its row. `invalid` means it isn't a real barcode, and `full`
   * that the list holds as many as one batch can.
   */
  function scan(raw: string, format?: string): ScanOutcome {
    const code = normalizeBarcode(raw, format)
    if (!code) return 'invalid'
    // A UPC or EAN-13 is looked up as scanned, anything else by its key.
    const digits = raw.replace(/\s+/g, '')
    const query = /^\d{12,13}$/.test(digits) ? digits : code
    if (rows.value.some((row) => row.code === code)) {
      highlight(code)
      return 'duplicate'
    }
    if (isFull.value) return 'full'
    navigator.vibrate?.(40)
    rows.value = [
      { code, query, status: 'loading', ticked: false },
      ...rows.value,
    ]
    highlight(code)
    void lookup(code)
    return 'added'
  }

  function retry(code: string) {
    update(code, { status: 'loading', problem: undefined })
    void lookup(code)
  }

  /**
   * Sets a row to a game the user chose with Find it or Change. Returns the
   * code of the row that already held the same game when the two merged
   * (this row is then gone), else null.
   */
  function pick(code: string, match: BarcodeMatch): string | null {
    const result = pickGame(rows.value, code, match, list.value)
    rows.value = result.rows
    save()
    if (result.merged) highlight(result.merged)
    return result.merged
  }

  function remove(code: string) {
    rows.value = rows.value.filter((row) => row.code !== code)
    save()
  }

  function setTicked(code: string, on: boolean) {
    const row = rows.value.find((r) => r.code === code)
    if (!row || (on && !canTick(row, list.value))) return
    update(code, { ticked: on })
    save()
  }

  /** Switches between Owned and the Wishlist, which can change which games are already there. */
  function setList(next: ListName) {
    list.value = next
    rows.value = rows.value.map((row) =>
      row.match ? { ...row, ticked: defaultTicked(row.match, next) } : row,
    )
    save()
  }

  function clear() {
    rows.value = []
    save()
  }

  /**
   * Adds the ticked games in one request, empties the list and refreshes
   * what shows the user's games. Games the user matched themselves are sent
   * with their barcode so the server can remember them for this user only.
   * Throws the server's refusal (the plan's
   * limits, say) and keeps the list.
   */
  async function addTicked(): Promise<BulkAddResult> {
    const result = await auth.apiFetch<BulkAddResult>(
      '/api/library-items/bulk',
      {
        method: 'POST',
        body: {
          list: list.value,
          items: toAdd.value,
          ...(collection.value &&
            intoCollection.value && { collectionId: collection.value.id }),
        },
      },
    )
    clear()
    // The games are added whatever happens here, so a failed refresh must
    // not look like a failed add.
    try {
      useGameMemberships().clear()
      await Promise.all([useMyCollections().refresh(), refreshNuxtData()])
    } catch {
      // The views catch up the next time they load.
    }
    return result
  }

  return {
    open,
    rows,
    list,
    collection,
    intoCollection,
    highlighted,
    toAdd,
    isFull,
    start,
    scan,
    retry,
    pick,
    remove,
    setTicked,
    setList,
    clear,
    addTicked,
  }
}
