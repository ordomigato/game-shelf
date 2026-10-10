import type { Ref } from 'vue'
import { toast } from 'vue-sonner'
import type { CollectionSummary } from '#shared/types/collection'
import type { GameSummary } from '#shared/types/game'

/**
 * Which search results the signed-in user already has, as IGDB id to
 * library item id. With a `target` collection it means "in that
 * collection", and `toggle` adds or removes a game in one click. Without
 * one it means "in any collection".
 *
 * Checked in the browser only, after hydration, and only for results not
 * checked yet, so loading more results doesn't re-ask for the first page.
 */
export function useTrackedGames(
  games: Ref<GameSummary[]>,
  target: Ref<CollectionSummary | null>,
) {
  const { t } = useI18n()
  const auth = useAuth()
  const collections = useCollections()
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
      const found = await collections.tracked(ids, target.value?.id)
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
        () => target.value?.id,
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

  /** Adds the game to the target collection, or removes it if it's there. */
  async function toggle(game: GameSummary) {
    const collection = target.value
    if (!collection || saving.value.has(game.id)) return
    saving.value = new Set(saving.value).add(game.id)
    const itemId = items.value.get(game.id)
    try {
      if (itemId) {
        await collections.removeItem(collection.id, itemId)
        mark(game.id, false)
        return
      }
      const added = await collections.addGame(
        { igdbId: game.id, name: game.name, coverId: game.coverId },
        [collection.id],
      )
      items.value = new Map(items.value).set(game.id, added.item.id)
    } catch {
      toast.error(t('addToCollection.saveFailed'))
    } finally {
      const done = new Set(saving.value)
      done.delete(game.id)
      saving.value = done
    }
  }

  return { items, saving, mark, toggle }
}
