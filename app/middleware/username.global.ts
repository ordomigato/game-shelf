/**
 * A signed-in user without a username is sent to the welcome screen to pick
 * one before using the app. On the first page load the check runs in the
 * background, so server-rendered pages don't wait on `/api/me` to become
 * interactive.
 */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server || to.path === '/welcome') return
  const auth = useAuth()
  const welcome = { path: '/welcome', query: { redirect: to.fullPath } }
  const needsUsername = () =>
    auth.status.value === 'signedIn' && !auth.me.value?.username

  if (useNuxtApp().isHydrating) {
    void auth.ensureLoaded().then(() => {
      if (needsUsername()) void navigateTo(welcome)
    })
    return
  }

  await auth.ensureLoaded()
  if (needsUsername()) return navigateTo(welcome)
})
