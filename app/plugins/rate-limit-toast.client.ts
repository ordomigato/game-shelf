import { toast } from 'vue-sonner'

/**
 * Tells people when the server turned a request away for being too many
 * (429, see server/middleware/rate-limit.ts). Every request the app makes
 * with $fetch or useFetch goes through here, so each place doesn't need its
 * own case. The fixed id keeps a burst of refused requests to one toast.
 */
export default defineNuxtPlugin(() => {
  const { t } = useNuxtApp().$i18n
  globalThis.$fetch = globalThis.$fetch.create({
    onResponseError({ response }) {
      if (response.status === 429) {
        toast.error(t('common.rateLimited'), { id: 'rate-limited' })
      }
    },
  })
})
