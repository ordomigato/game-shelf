import type { LibraryItem } from '#shared/types/collection'

/**
 * The user's item for an IGDB game, if any (with its place on Owned and the
 * Wishlist), the collections it's in, and the catalog platforms to pick
 * from, when the server had them.
 */
export interface GameMembership {
  item: LibraryItem | null
  collectionIds: string[]
  platforms?: { id: number; name: string }[]
}

// Browser only: these are only filled by signed-in requests.
// Requests on their way, by IGDB id, so two asks at once share one request.
const pending = new Map<number, Promise<GameMembership>>()
// Goes up with every change, so an answer that was asked for before the
// change isn't kept.
let version = 0

/**
 * Which collections each IGDB game is in, kept until the page reloads, so
 * opening the Add to collection menu again for a game doesn't ask the
 * server again. `useCollections` keeps it right: a change whose result is
 * known is written in, and anything else drops the games it could touch,
 * which are asked for again next time.
 */
export function useGameMemberships() {
  const entries = useState<Record<number, GameMembership>>(
    'game-memberships',
    () => ({}),
  )

  function change(next: Record<number, GameMembership>) {
    version += 1
    pending.clear()
    entries.value = next
  }

  /** The kept answer for a game, or `load`'s, which is then kept. */
  function get(
    igdbId: number,
    load: () => Promise<GameMembership>,
  ): Promise<GameMembership> {
    const known = entries.value[igdbId]
    if (known) return Promise.resolve(known)
    const asking = pending.get(igdbId)
    if (asking) return asking
    const asked = version
    const request = load()
      .then((membership) => {
        if (version === asked) {
          entries.value = { ...entries.value, [igdbId]: membership }
        }
        return membership
      })
      .finally(() => {
        if (pending.get(igdbId) === request) pending.delete(igdbId)
      })
    pending.set(igdbId, request)
    return request
  }

  function set(igdbId: number, membership: GameMembership) {
    change({
      ...entries.value,
      [igdbId]: {
        platforms: entries.value[igdbId]?.platforms,
        ...membership,
      },
    })
  }

  /**
   * Records an item after a change to its lists: its new state (null when
   * it was deleted) and the collections it's still in.
   */
  function setItem(
    itemId: string,
    item: LibraryItem | null,
    collectionIds: string[],
  ) {
    change(
      Object.fromEntries(
        Object.entries(entries.value).map(([igdbId, membership]) => [
          igdbId,
          membership.item?.id === itemId
            ? { ...membership, item, collectionIds }
            : membership,
        ]),
      ),
    )
  }

  /** Records the collections an item is in after a change. */
  function setCollections(itemId: string, collectionIds: string[]) {
    change(
      Object.fromEntries(
        Object.entries(entries.value).map(([igdbId, membership]) => [
          igdbId,
          membership.item?.id === itemId
            ? { ...membership, collectionIds }
            : membership,
        ]),
      ),
    )
  }

  function forgetGame(igdbId: number) {
    const { [igdbId]: _dropped, ...rest } = entries.value
    change(rest)
  }

  function forgetItem(itemId: string) {
    change(
      Object.fromEntries(
        Object.entries(entries.value).filter(
          ([, membership]) => membership.item?.id !== itemId,
        ),
      ),
    )
  }

  function clear() {
    change({})
  }

  return { get, set, setItem, setCollections, forgetGame, forgetItem, clear }
}
