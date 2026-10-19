/**
 * The games an import would add to a collection, from its rows. A row with
 * no IGDB game becomes a game of its own, however many share a title. Rows
 * with the same IGDB game are one game, and a game already in the
 * collection only gets its values updated.
 */
export function newGamesIn(
  rows: { igdbId: number | null }[],
  inCollection: ReadonlySet<number>,
): { unlinked: number; linkedIds: number[] } {
  const linked = new Set<number>()
  let unlinked = 0
  for (const row of rows) {
    if (row.igdbId === null) unlinked++
    else if (!inCollection.has(row.igdbId)) linked.add(row.igdbId)
  }
  return { unlinked, linkedIds: [...linked] }
}
