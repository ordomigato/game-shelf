import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrations = new URL('./migrations/', import.meta.url)
const journal = JSON.parse(
  readFileSync(new URL('meta/_journal.json', migrations), 'utf8'),
) as { entries: { idx: number; tag: string }[] }

const tag = journal.entries.find((entry) => entry.tag.startsWith('0029_'))?.tag
const statements = readFileSync(new URL(`${tag}.sql`, migrations), 'utf8')
  .split('--> statement-breakpoint')
  .map((statement) => statement.trim())

describe('the drop reviews_barcodes migration', () => {
  it('comes right after the follows migration', () => {
    expect(tag).toBe('0029_drop_reviews_barcodes')
    expect(journal.entries.find((entry) => entry.idx === 28)?.tag).toBe(
      '0028_follows',
    )
  })

  it('only drops the old reviewer flag', () => {
    expect(statements).toEqual([
      'ALTER TABLE "users" DROP COLUMN "reviews_barcodes";',
    ])
  })
})
