import type { Message } from '../types/message'

export const SLUG_MAX_LENGTH = 60
/** Slugs no custom collection can take. */
export const RESERVED_SLUGS = new Set(['wishlist'])

/**
 * The URL name for a title: accents removed, lowercase, anything that isn't
 * a letter or number becomes a hyphen. "Zelda: Oracle Games" becomes
 * "zelda-oracle-games". Can be empty for titles with no letters or numbers.
 */
export function slugify(title: string): string {
  return title
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, SLUG_MAX_LENGTH)
    .replace(/-+$/, '')
}

/** Why a custom collection can't use this title, or null when it can. */
export function collectionTitleProblem(title: string): Message | null {
  const slug = slugify(title)
  if (!slug) return { key: 'collections.problems.noLetters' }
  if (RESERVED_SLUGS.has(slug)) return { key: 'collections.problems.reserved' }
  return null
}
