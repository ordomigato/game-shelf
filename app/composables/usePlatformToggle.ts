import { toast } from 'vue-sonner'
import type { LibraryItem, ListName } from '#shared/types/collection'

/** The part of a game the platform pickers read. */
type PlatformState = Partial<
  Pick<LibraryItem, 'owned' | 'wishlisted' | 'ownedOn' | 'wantedOn'>
>

/**
 * Ticking a platform in "Owned on" or "Wishlisted on", for a game the
 * picker may not have saved yet. `current` is the game as last saved (null
 * before it's on any list) and `persist` saves one list's platforms. A tick
 * shows at once and is undone with a message if saving fails. Ticks are
 * ignored while a save runs. A tick that moves the game to the other list
 * says so, like the row's "Got it".
 */
export function usePlatformToggle(
  current: () => PlatformState | null,
  persist: (list: ListName, platforms: number[]) => Promise<LibraryItem | null>,
) {
  const { t } = useI18n()
  const { shelfPath } = useViewer()
  const moves = useListMoves(computed(() => shelfPath.value ?? ''))

  const saving = ref(false)
  /** The platforms as ticked, until the save finishes. */
  const pending = ref<{ ownedOn: number[]; wantedOn: number[] } | null>(null)

  const ownedOn = computed(
    () => pending.value?.ownedOn ?? current()?.ownedOn ?? [],
  )
  const wantedOn = computed(
    () => pending.value?.wantedOn ?? current()?.wantedOn ?? [],
  )

  /** Resolves with the game as saved, or null when nothing was saved. */
  async function toggle(
    list: ListName,
    platformId: number,
    on: boolean,
  ): Promise<LibraryItem | null> {
    if (saving.value) return null
    const before = current()
    const owned = new Set(ownedOn.value)
    const wanted = new Set(wantedOn.value)
    const [mine, other] = list === 'owned' ? [owned, wanted] : [wanted, owned]
    if (on) {
      mine.add(platformId)
      other.delete(platformId)
    } else {
      mine.delete(platformId)
    }
    pending.value = { ownedOn: [...owned], wantedOn: [...wanted] }
    saving.value = true
    try {
      const saved = await persist(list, [...mine])
      if (saved && before) moves.announce(before, saved)
      return saved
    } catch (error) {
      toast.error(limitMessage(error, t) ?? t('table.platformsSaveFailed'))
      return null
    } finally {
      pending.value = null
      saving.value = false
    }
  }

  return { ownedOn, wantedOn, saving, toggle }
}
