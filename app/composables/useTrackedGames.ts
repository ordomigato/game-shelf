import type { Ref } from 'vue'
import { toast } from 'vue-sonner'
import type { ListName } from '#shared/types/collection'
import type { GameSummary } from '#shared/types/game'

/** Where search is adding games: one of the user's collections, or a list. */
export interface SearchTarget {
  /** The address of its page under the shelf. */
  slug: string
  title: string
  /** Set for a collection. */
  collectionId?: string
  /** Set for Owned or the Wishlist. */
  list?: ListName
}

/**
 * Which search results the signed-in user already has, as IGDB id to
 * library item id. With a `target` it means "in that collection" or "on
 * that list", and `toggle` adds or removes a game in one click. Without
 * one it means "on either list".
 *
 * Checked in the browser only, after hydration, and only for results not
 * checked yet, so loading more results doesn't re-ask for the first page.
 */
export function useTrackedGames(
  games: Ref<GameSummary[]>,
  target: Ref<SearchTarget | null>,
) {
  const { t } = useI18n()
  const auth = useAuth()
  const collections = useCollections()
  const unown = useUnownConfirm()
  const items = ref(new Map<number, string>())
  const saving = ref(new Set<number>())
  let checked = new Set<number>()

  async function check() {
    await auth.ensureLoaded()
    if (auth.status.value !== 'signedIn') return
    const ids = games.value
      .map((game) => game.id)
      .filter((id) => !checked.has(id))
    if (!ids.length) return
    const asked = checked
    ids.forEach((id) => asked.add(id))
    try {
      const found = await collections.tracked(ids, {
        collectionId: target.value?.collectionId,
        list: target.value?.list,
      })
      // The target changed while this was in flight.
      if (asked !== checked) return
      const next = new Map(items.value)
      found.forEach(({ igdbId, itemId }) => next.set(igdbId, itemId))
      items.value = next
    } catch {
      // Only a hint. Adding still works, and the menu loads the real state.
      ids.forEach((id) => asked.delete(id))
    }
  }

  function reset() {
    checked = new Set()
    items.value = new Map()
  }

  onMounted(() => {
    onNuxtReady(() => {
      watch(games, () => void check(), { immediate: true })
      watch(
        () => target.value?.slug,
        () => {
          reset()
          void check()
        },
      )
    })
  })

  /** Records a change made elsewhere, like in the Add to collection menu. */
  function mark(igdbId: number, tracked: boolean) {
    const next = new Map(items.value)
    if (tracked) next.set(igdbId, next.get(igdbId) ?? '')
    else next.delete(igdbId)
    items.value = next
  }

  /** Adds the game to the target, or removes it if it's there. */
  async function toggle(game: GameSummary) {
    const goal = target.value
    if (!goal || saving.value.has(game.id)) return
    saving.value = new Set(saving.value).add(game.id)
    const itemId = items.value.get(game.id)
    try {
      if (itemId) {
        if (goal.list) {
          const { item } = await collections.membership(game.id)
          // Cancelled when the person says no to deleting the game.
          if (item && !(await unown.leave(item, goal.list))) return
        } else {
          await collections.removeItem(goal.collectionId!, itemId)
        }
        mark(game.id, false)
        return
      }
      const added = await collections.addGame(
        { igdbId: game.id, name: game.name, coverId: game.coverId },
        goal.collectionId ? [goal.collectionId] : [],
        goal.list ? { list: goal.list } : {},
      )
      items.value = new Map(items.value).set(game.id, added.item.id)
    } catch (error) {
      toast.error(limitMessage(error, t) ?? t('addToCollection.saveFailed'))
    } finally {
      const done = new Set(saving.value)
      done.delete(game.id)
      saving.value = done
    }
  }

  return { items, saving, mark, toggle }
}
