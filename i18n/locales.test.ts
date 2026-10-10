import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { describe, expect, it } from 'vitest'
import en from './locales/en.json'

const root = join(__dirname, '..')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) {
      return name === 'ui' ? [] : sourceFiles(path)
    }
    return /\.(vue|ts)$/.test(name) && !name.endsWith('.test.ts') ? [path] : []
  })
}

function flatten(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix]
  return Object.entries(node as Record<string, unknown>).flatMap(
    ([key, value]) => flatten(value, prefix ? `${prefix}.${key}` : key),
  )
}

const messageKeys = new Set(flatten(en))
const files = [
  ...sourceFiles(join(root, 'app')),
  ...sourceFiles(join(root, 'shared')),
]

/** Keys passed to t(), $t() or <i18n-t keypath>, or kept as `key`/`labelKey` values. */
function referencedKeys(): { key: string; file: string }[] {
  const patterns = [
    /(?<![\w$])\$?t\(\s*'([a-zA-Z0-9_.]+)'/g,
    /keypath="([a-zA-Z0-9_.]+)"/g,
    /(?:\w*Key|key):\s*'([a-zA-Z0-9_.]+)'/g,
  ]
  return files.flatMap((file) => {
    const source = readFileSync(file, 'utf8')
    return patterns.flatMap((pattern) =>
      [...source.matchAll(pattern)].map((match) => ({
        key: match[1]!,
        file: relative(root, file),
      })),
    )
  })
}

describe('English messages', () => {
  it('has a message for every key the app uses', () => {
    const missing = referencedKeys().filter(({ key }) => !messageKeys.has(key))
    expect(missing).toEqual([])
  })

  it('has no messages that nothing uses', () => {
    const used = new Set(referencedKeys().map(({ key }) => key))
    // authErrors.* are looked up by Cognito error name at runtime.
    const unused = [...messageKeys].filter(
      (key) => !used.has(key) && !key.startsWith('authErrors.'),
    )
    expect(unused).toEqual([])
  })
})
