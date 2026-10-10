<script setup lang="ts">
import { Plus } from '@lucide/vue'
import type { CollectionSummary } from '#shared/types/collection'

const route = useRoute()
const { t } = useI18n()
const collections = useCollections()

const username = computed(() => String(route.params.username).toLowerCase())
const isMine = computed(() => collections.isMine(username.value))

const { data, status, error, refresh } = useAsyncData(
  () => `shelf-${username.value}`,
  () => collections.list(username.value),
  { watch: [username] },
)

const { data: profile } = useAsyncData(
  () => `profile-${username.value}`,
  () => collections.profile(username.value),
  { watch: [username] },
)
const { locale } = useI18n()
const memberSince = computed(() =>
  profile.value
    ? new Intl.DateTimeFormat(locale.value, {
        month: 'long',
        year: 'numeric',
      }).format(new Date(profile.value.memberSince))
    : '',
)
const shelfOwner = computed(() => profile.value?.displayName || username.value)

const notFound = computed(() => error.value?.statusCode === 404)

useHead(() => ({
  title: t('app.title', {
    page: isMine.value
      ? t('shelf.myTitle')
      : t('shelf.userTitle', { username: shelfOwner.value }),
  }),
}))

const creating = ref(false)

async function onCreated(collection: CollectionSummary) {
  await navigateTo(`/u/${username.value}/shelf/${collection.slug}`)
}
</script>

<template>
  <div class="flex flex-col gap-6">
    <div v-if="notFound" class="py-16 text-center">
      <h1 class="text-3xl font-bold">{{ $t('error.notFoundTitle') }}</h1>
      <p class="mt-2 text-muted-foreground">{{ $t('error.notFoundBody') }}</p>
    </div>

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-4">
        <div class="flex flex-col gap-1">
          <h1 class="text-3xl font-bold">
            {{
              isMine
                ? $t('shelf.myTitle')
                : $t('shelf.userTitle', { username: shelfOwner })
            }}
          </h1>
          <p v-if="profile" class="text-sm text-muted-foreground">
            @{{ profile.username }} ·
            {{ $t('shelf.memberSince', { date: memberSince }) }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <ShareButton
            :path="`/u/${username}/shelf`"
            :title="
              isMine
                ? $t('shelf.myTitle')
                : $t('shelf.userTitle', { username: shelfOwner })
            "
            is-public
          />
          <Button v-if="isMine" @click="creating = true">
            <Plus />
            {{ $t('shelf.newCollection') }}
          </Button>
        </div>
      </div>

      <div
        v-if="status === 'pending' && !data"
        class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
        aria-hidden="true"
      >
        <Skeleton v-for="n in 3" :key="n" class="h-32 rounded-lg" />
      </div>

      <div v-else-if="error" class="py-12 text-center">
        <p class="text-lg font-medium">{{ $t('shelf.loadFailed') }}</p>
        <Button class="mt-4" @click="refresh()">{{ $t('shelf.retry') }}</Button>
      </div>

      <p
        v-else-if="data && !data.length"
        class="py-12 text-center text-muted-foreground"
      >
        {{
          isMine
            ? $t('shelf.emptyMine')
            : $t('shelf.emptyVisitor', { username })
        }}
      </p>

      <ul v-else-if="data" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="collection in data" :key="collection.id">
          <CollectionCard
            :collection="collection"
            :username="username"
            :show-visibility="isMine"
          />
        </li>
      </ul>
    </template>

    <CollectionFormDialog v-model:open="creating" @saved="onCreated" />
  </div>
</template>
