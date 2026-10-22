import { describe, expect, it, vi } from 'vitest'
import { getTableConfig, PgDialect } from 'drizzle-orm/pg-core'
import { barcodeLookups } from '../db/schema'

interface Statement {
  kind: 'delete'
  table: unknown
  where?: never
}
const batches: Statement[][] = []

vi.stubGlobal('useDb', () => {
  const db = {
    delete: (table: unknown) => ({
      kind: 'delete' as const,
      table,
      where(condition: never) {
        this.where = condition as never
        return this
      },
    }),
    select: () => ({
      from: () => ({ where: () => ({ kind: 'subquery' }) }),
    }),
    batch: async (statements: Statement[]) => {
      batches.push(statements)
      return []
    },
  }
  return db
})

const { deleteAccountData } = await import('./account-data')

describe('deleteAccountData', () => {
  it('deletes the user’s pending and rejected picks, then the user, in one batch', async () => {
    await deleteAccountData('sub-1')
    expect(batches).toHaveLength(1)
    const [picks, user] = batches[0]!
    expect(picks!.table).toBe(barcodeLookups)
    expect(user!.table).not.toBe(barcodeLookups)
    const { sql, params } = new PgDialect().sqlToQuery(picks!.where!)
    expect(sql).toContain('"barcode_lookups"."source" = $1')
    expect(sql).toContain('"barcode_lookups"."status" in ($2, $3)')
    expect(sql).toContain('"barcode_lookups"."submitted_by" in')
    expect(params.slice(0, 3)).toEqual(['user', 'pending', 'rejected'])
  })

  it('never names approved picks, which stay for everyone', async () => {
    batches.length = 0
    await deleteAccountData('sub-1')
    const { params } = new PgDialect().sqlToQuery(batches[0]![0]!.where!)
    expect(params).not.toContain('approved')
    expect(params).not.toContain('scandex')
  })

  it('leaves an approved pick without a name when the user goes', () => {
    const fk = getTableConfig(barcodeLookups).foreignKeys.find(
      (key) => key.reference().columns[0]?.name === 'submitted_by',
    )
    expect(fk?.onDelete).toBe('set null')
  })
})
