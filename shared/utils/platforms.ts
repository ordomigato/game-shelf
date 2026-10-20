import type { CollectionEntry, PlatformOption } from '../types/collection'

/**
 * The platforms a game is owned and wanted on, from the catalog platforms
 * it can pick from, in the order of those (by name). Ids the catalog no
 * longer lists are left out.
 */
export function platformsOf(
  item: Pick<CollectionEntry, 'catalogPlatforms' | 'ownedOn' | 'wantedOn'>,
): { owned: PlatformOption[]; wanted: PlatformOption[] } {
  const options = item.catalogPlatforms ?? []
  return {
    owned: options.filter(({ id }) => item.ownedOn?.includes(id)),
    wanted: options.filter(({ id }) => item.wantedOn?.includes(id)),
  }
}

/** A game's genres as the short comma list the table shows. */
export const genresText = (genres: readonly string[]) => genres.join(', ')
