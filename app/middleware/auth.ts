/** For pages that need a signed-in user. Sends others to sign in. */
export default defineNuxtRouteMiddleware(async (to) => {
  if (import.meta.server) return
  const auth = useAuth()
  await auth.ensureLoaded()
  if (auth.status.value !== 'signedIn') {
    return navigateTo({ path: '/login', query: { redirect: to.fullPath } })
  }
})
