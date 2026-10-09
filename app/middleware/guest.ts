/** For sign-in and sign-up pages. Sends signed-in users home. */
export default defineNuxtRouteMiddleware(async () => {
  if (import.meta.server) return
  const auth = useAuth()
  await auth.ensureLoaded()
  if (auth.status.value === 'signedIn') return navigateTo('/')
})
