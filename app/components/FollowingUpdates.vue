<script setup lang="ts">
import type { FollowUpdate, FollowUpdates } from '#shared/types/follows'

/**
 * "From accounts you follow" on the home page: the newest changes to their
 * public collections and lists. Not shown to visitors, nor to anyone who
 * follows nobody.
 */
const { t, locale } = useI18n()
const auth = useAuth()
const follows = useFollows()

const result = ref<FollowUpdates | null>(null)
const now = ref(new Date())

onMounted(async () => {
  await auth.ensureLoaded()
  if (auth.status.value !== 'signedIn') return
  try {
    result.value = await follows.updates()
    now.value = new Date()
  } catch {
    // The home page works without it.
  }
})

function path(update: FollowUpdate): string {
  const base = `/u/${encodeURIComponent(update.username)}/shelf`
  return update.kind === 'collection'
    ? `${base}/${encodeURIComponent(update.slug!)}`
    : `${base}/${update.kind}`
}

function what(update: FollowUpdate): string {
  if (update.kind === 'collection') {
    return t('follows.updatedCollection', { title: update.title ?? '' })
  }
  return update.kind === 'owned'
    ? t('follows.updatedOwned')
    : t('follows.updatedWishlist')
}
</script>

<template>
  <section v-if="result?.followsAnyone" class="mx-auto w-full max-w-2xl">
    <h2 class="font-heading text-xl font-semibold">
      {{ $t('follows.updatesTitle') }}
    </h2>
    <p v-if="!result.items.length" class="mt-3 text-sm text-muted-foreground">
      {{ $t('follows.updatesEmpty') }}
    </p>
    <ul v-else class="mt-3 flex flex-col gap-2">
      <li
        v-for="update in result.items"
        :key="`${update.username}-${path(update)}`"
      >
        <NuxtLink
          :to="path(update)"
          class="flex items-baseline gap-3 rounded-lg border bg-card p-3 outline-none transition hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span class="font-medium">{{ update.username }}</span>
          <span class="min-w-0 flex-1 truncate text-muted-foreground">{{
            what(update)
          }}</span>
          <span class="shrink-0 text-sm text-muted-foreground">{{
            timeAgo(update.updatedAt, now, locale)
          }}</span>
        </NuxtLink>
      </li>
    </ul>
  </section>
</template>
