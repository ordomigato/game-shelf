import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const migrations = new URL('./migrations/', import.meta.url)
const journal = JSON.parse(
  readFileSync(new URL('meta/_journal.json', migrations), 'utf8'),
) as { entries: { idx: number; tag: string }[] }

const tag = journal.entries.find((entry) => entry.tag.startsWith('0027_'))?.tag
const statements = readFileSync(new URL(`${tag}.sql`, migrations), 'utf8')
  .split('--> statement-breakpoint')
  .map((statement) => statement.trim())

const indexOf = (text: string) =>
  statements.findIndex((statement) => statement.includes(text))

describe('the roles migration', () => {
  it('comes right after the barcode review migration', () => {
    expect(tag).toBe('0027_user_roles')
    expect(journal.entries.at(-2)?.tag).toBe('0026_barcode_review')
  })

  it('adds roles as a list that is empty for everyone', () => {
    expect(statements[indexOf('ADD COLUMN "roles"')]).toBe(
      'ALTER TABLE "users" ADD COLUMN "roles" text[] DEFAULT \'{}\'::text[] NOT NULL;',
    )
  })

  it('makes every reviewer an admin once the column exists', () => {
    const add = indexOf('ADD COLUMN "roles"')
    const copy = indexOf('UPDATE "users" SET "roles"')
    expect(statements[copy]).toBe(
      'UPDATE "users" SET "roles" = \'{admin}\' WHERE "reviews_barcodes";',
    )
    expect(copy).toBeGreaterThan(add)
  })

  it('leaves reviews_barcodes in place, for the release still running during a deploy', () => {
    expect(statements.join('\n')).not.toMatch(/DROP COLUMN|RENAME/)
  })

  it('allows only known role names', () => {
    expect(statements.join('\n')).toContain(
      'ADD CONSTRAINT "users_roles" CHECK ("users"."roles" <@ array[\'admin\']::text[])',
    )
  })
})
