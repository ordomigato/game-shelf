import type { ImportRow, PlatformProblem } from '../../shared/utils/csv-import'

/** A catalog platform, by IGDB id, with its names. */
export interface PlatformName {
  igdbId: number
  name: string
  abbreviation: string | null
}

/** Where a game the user already has stands on the lists. */
export interface HeldGame {
  owned: boolean
  ownedOn: number[]
  wantedOn: number[]
}

const sameName = (a: string, b: string) =>
  a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase()

/**
 * Matches the platform names in an import to each game's catalog platforms
 * (by name or short name, any case), and works out which can be ticked.
 * Owned platforms go to `owned`, wishlist platforms to `wanted`, both by
 * IGDB game id. Everything left out is a problem for the person to see:
 * unknown names, games added by hand, a platform the game already has on
 * the other list, and platforms on a game that is only on the Wishlist.
 * It merges and never erases, so nothing already ticked is touched.
 */
export function planPlatforms(
  rows: ImportRow[],
  /** The catalog platforms of the row's game, or undefined for a game added by hand. */
  gameOf: (
    row: ImportRow,
  ) => { igdbId: number; platformIds: number[] } | undefined,
  catalog: PlatformName[],
  held: (igdbId: number) => HeldGame | undefined,
): {
  problems: PlatformProblem[]
  owned: Map<number, Set<number>>
  wanted: Map<number, Set<number>>
} {
  const problems: PlatformProblem[] = []
  const owned = new Map<number, Set<number>>()
  const wanted = new Map<number, Set<number>>()
  const add = (into: Map<number, Set<number>>, game: number, ids: number[]) => {
    const set = into.get(game) ?? new Set<number>()
    ids.forEach((id) => set.add(id))
    into.set(game, set)
  }

  for (const row of rows) {
    if (!row.platforms?.length && !row.wishlistPlatforms?.length) continue
    const at = row.row ?? 0
    const game = gameOf(row)
    const lists = [
      { list: 'owned' as const, names: row.platforms ?? [] },
      { list: 'wanted' as const, names: row.wishlistPlatforms ?? [] },
    ].filter(({ names }) => names.length)
    if (!game) {
      for (const { list, names } of lists) {
        problems.push({
          row: at,
          list,
          value: names.join('; '),
          reason: 'handAddedPlatforms',
        })
      }
      continue
    }
    const onGame = catalog.filter((platform) =>
      game.platformIds.includes(platform.igdbId),
    )
    const have = held(game.igdbId)
    // The ids each list names, with the name the file used for each.
    const named: Record<'owned' | 'wanted', Map<number, string>> = {
      owned: new Map(),
      wanted: new Map(),
    }
    for (const { list, names } of lists) {
      for (const name of names) {
        const found = onGame.find(
          (platform) =>
            sameName(platform.name, name) ||
            (platform.abbreviation !== null &&
              sameName(platform.abbreviation, name)),
        )
        if (found) named[list].set(found.igdbId, name)
        else {
          problems.push({
            row: at,
            list,
            value: name,
            reason: 'unknownPlatform',
          })
        }
      }
    }
    const report = (
      list: 'owned' | 'wanted',
      ids: number[],
      reason: PlatformProblem['reason'],
    ) => {
      if (!ids.length) return
      problems.push({
        row: at,
        list,
        value: ids.map((id) => named[list].get(id)).join('; '),
        reason,
      })
    }

    const ownedIds = [...named.owned.keys()]
    let ticked: number[] = []
    if (have && !have.owned) {
      report('owned', ownedIds, 'notOwnedPlatforms')
    } else {
      const wantedAlready = new Set(have?.wantedOn)
      report(
        'owned',
        ownedIds.filter((id) => wantedAlready.has(id)),
        'wantedPlatforms',
      )
      ticked = ownedIds.filter((id) => !wantedAlready.has(id))
      add(owned, game.igdbId, ticked)
    }

    // A platform the game is already owned on (or the file says so) isn't wanted.
    const ownedAlready = new Set([...(have?.ownedOn ?? []), ...ticked])
    const wantedIds = [...named.wanted.keys()]
    report(
      'wanted',
      wantedIds.filter((id) => ownedAlready.has(id)),
      'ownedPlatforms',
    )
    add(
      wanted,
      game.igdbId,
      wantedIds.filter((id) => !ownedAlready.has(id)),
    )
  }
  return { problems, owned, wanted }
}
