/**
 * Who is looking, for drawing the layout. While the real check is still
 * running (and during server rendering), the `gs_user` cookie decides, so
 * the page doesn't jump after a refresh.
 */
export function useViewer() {
  const auth = useAuth()
  const signedIn = computed(
    () =>
      auth.status.value === 'signedIn' ||
      (auth.status.value === 'loading' && Boolean(auth.hint.value)),
  )
  const username = computed(
    () => auth.me.value?.username ?? auth.hint.value?.username ?? null,
  )
  const shelfPath = computed(() =>
    username.value ? `/u/${username.value}/shelf` : null,
  )
  return { signedIn, username, shelfPath }
}
