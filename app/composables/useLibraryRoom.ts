/**
 * Whether the signed-in user's library is full: it holds as many games as
 * the plan allows, owned or wishlisted. A new game then can't be added,
 * though one already in the library can still move between lists and
 * collections. The count comes from the sidebar's, which every change to
 * the lists refreshes. A page that shows many add buttons passes `load` to
 * fetch the count once, as soon as the browser knows who is signed in.
 */
export function useLibraryRoom({ load = false } = {}) {
  const { limits } = usePlan()
  const auth = useAuth()
  const { counts, loadCounts } = useMyCollections()
  const full = computed(
    () => (counts.value?.library ?? 0) >= limits.value.games,
  )
  if (load) {
    onMounted(() => {
      onNuxtReady(async () => {
        await auth.ensureLoaded()
        if (auth.status.value === 'signedIn') void loadCounts()
      })
    })
  }
  return { full }
}
