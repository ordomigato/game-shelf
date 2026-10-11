import type { GameSummary } from '../types/game'

/** How sure a name match is. */
export type MatchConfidence = 'exact' | 'close' | 'none'

/** A file's game name matched against IGDB. */
export interface NameMatch {
  name: string
  confidence: MatchConfidence
  /** The IGDB game suggested, or null when nothing came close. */
  suggestion: number | null
  /** IGDB's games to choose from, best first. */
  candidates: GameSummary[]
}

/** The most names one match request takes. */
export const MATCH_BATCH_SIZE = 10
/** Names past this many in one import come in by hand, unmatched. */
export const MAX_MATCH_NAMES = 1000

const ROMAN: Record<string, string> = {
  i: '1',
  ii: '2',
  iii: '3',
  iv: '4',
  v: '5',
  vi: '6',
  vii: '7',
  viii: '8',
  ix: '9',
  x: '10',
}

/**
 * A game title reduced to what matters for matching: no accents, case,
 * punctuation or leading "the", no "&" or "and" (so "Banjo & Kazooie"
 * matches "Banjo-Kazooie"), and Roman numerals as digits, so "The Legend
 * of Zelda: Ocarina of Time" matches "legend of zelda ocarina of time" and
 * "Final Fantasy III" matches "Final Fantasy 3".
 */
export function normalizeTitle(title: string): string {
  return title
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/^the /, '')
    .split(' ')
    .filter((word) => word !== 'and')
    .map((word) => ROMAN[word] ?? word)
    .join(' ')
}

/**
 * The suggestion for a name from IGDB's ranked results: a game whose title
 * normalizes to the same text is an exact match (the most popular one, if
 * several), otherwise the top result is a close match to check, and no
 * results is no match. Exact matches move to the front of the candidates.
 */
export function pickMatch(name: string, ranked: GameSummary[]): NameMatch {
  const key = normalizeTitle(name)
  const exact = ranked.find((game) => normalizeTitle(game.name) === key)
  if (exact) {
    return {
      name,
      confidence: 'exact',
      suggestion: exact.id,
      candidates: [exact, ...ranked.filter((game) => game !== exact)],
    }
  }
  return {
    name,
    confidence: ranked.length ? 'close' : 'none',
    suggestion: ranked[0]?.id ?? null,
    candidates: ranked,
  }
}
