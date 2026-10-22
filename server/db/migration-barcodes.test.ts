import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrations = new URL('./migrations/', import.meta.url)
const journal = JSON.parse(
  readFileSync(new URL('meta/_journal.json', migrations), 'utf8'),
) as { entries: { idx: number; tag: string }[] }

const tag = journal.entries.find((entry) => entry.tag.startsWith('0025_'))?.tag
const statements = readFileSync(new URL(`${tag}.sql`, migrations), 'utf8')
  .split('--> statement-breakpoint')
  .map((statement) => statement.trim())

/** The statements that change one column, in order. */
const touching = (column: string) =>
  statements.filter((statement) => statement.includes(`"${column}"`))

describe('the barcode review migration', () => {
  it('is the only 0025, and the user_barcodes one is gone', () => {
    expect(
      journal.entries.filter((entry) => entry.tag.startsWith('0025_')),
    ).toHaveLength(1)
    expect(tag).toBe('0025_barcode_review')
    expect(statements.join('\n')).not.toContain('user_barcodes')
    expect(statements.join('\n')).not.toContain('contributes_barcodes')
  })

  it('makes every row that is already there a ScanDex row', () => {
    const [add, drop] = touching('source').filter((statement) =>
      statement.includes('"source"'),
    )
    // Existing rows get the default while the column is added as NOT NULL,
    // and the default goes straight away, so a new row must say its source.
    expect(add).toContain(
      'ADD COLUMN "source" text DEFAULT \'scandex\' NOT NULL',
    )
    expect(drop).toContain('ALTER COLUMN "source" DROP DEFAULT')
  })

  it('swaps the code key for an identity id, dropping the old key first', () => {
    const dropKey = statements.findIndex((s) =>
      s.includes('DROP CONSTRAINT "barcode_lookups_pkey"'),
    )
    const addId = statements.findIndex((s) =>
      s.includes('ADD COLUMN "id" integer PRIMARY KEY'),
    )
    expect(dropKey).toBeGreaterThanOrEqual(0)
    expect(addId).toBeGreaterThan(dropKey)
    expect(statements[addId]).toContain('GENERATED ALWAYS AS IDENTITY')
  })

  it('keeps fetched_at of the rows already there, for ScanDex rows only', () => {
    const text = statements.join('\n')
    expect(text).toContain('ALTER COLUMN "fetched_at" DROP NOT NULL')
    expect(text).not.toMatch(/UPDATE "barcode_lookups" SET "fetched_at"/)
    expect(text).toMatch(
      /"source" = 'scandex' and "barcode_lookups"."status" is null and "barcode_lookups"."fetched_at" is not null/,
    )
  })

  it('adds the review flag for the reviewer, off for everyone', () => {
    expect(statements.join('\n')).toContain(
      'ADD COLUMN "reviews_barcodes" boolean DEFAULT false NOT NULL',
    )
  })

  it('has the partial unique indexes: one ScanDex row per code, one pick per user and code', () => {
    const text = statements.join('\n')
    expect(text).toMatch(
      /CREATE UNIQUE INDEX "barcode_lookups_scandex_idx" ON "barcode_lookups" USING btree \("code"\) WHERE "barcode_lookups"."source" = 'scandex'/,
    )
    expect(text).toMatch(
      /CREATE UNIQUE INDEX "barcode_lookups_pick_idx" ON "barcode_lookups" USING btree \("code","submitted_by"\) WHERE "barcode_lookups"."source" = 'user' and "barcode_lookups"."submitted_by" is not null/,
    )
  })

  it('removes the name when a user goes, and keeps the row', () => {
    expect(statements.join('\n')).toMatch(
      /FOREIGN KEY \("submitted_by"\) REFERENCES "public"."users"\("id"\) ON DELETE set null/,
    )
  })

  it('checks the source, the status and their match', () => {
    const text = statements.join('\n')
    expect(text).toContain("\"source\" in ('scandex', 'user')")
    expect(text).toContain("\"status\" in ('pending', 'approved', 'rejected')")
    expect(text).toContain('barcode_lookups_source_parts')
    // The no-match rule from 0024 stays as it is.
    expect(text).not.toContain('barcode_lookups_match_parts')
  })
})
