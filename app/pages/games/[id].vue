<script setup lang="ts">
import { ArrowLeft, ExternalLink } from '@lucide/vue'
import type { GameDetails } from '#shared/types/game'

const route = useRoute()
const { t, locale } = useI18n()
const router = useRouter()

const { data: game, error } = await useFetch<GameDetails>(
  () => `/api/games/${String(route.params.id)}`,
)

if (error.value) {
  const notFound = [400, 404].includes(error.value.statusCode ?? 0)
  throw createError({
    statusCode: notFound ? 404 : 502,
    statusMessage: notFound ? 'Game not found' : 'Game data unavailable',
    fatal: true,
  })
}

useHead(() => ({
  title: game.value ? t('app.title', { page: game.value.name }) : 'GameShelf',
}))

// Rendered on the server, so link previews show the game.
useSeoMeta({
  description: () => game.value?.summary?.slice(0, 300) ?? t('preview.site'),
  ogSiteName: 'GameShelf',
  ogType: 'website',
  ogTitle: () => game.value?.name ?? 'GameShelf',
  ogDescription: () => game.value?.summary?.slice(0, 300) ?? t('preview.site'),
  ogImage: () =>
    game.value?.coverId
      ? igdbImageUrl(game.value.coverId, 'cover_big')
      : undefined,
  twitterCard: 'summary',
})

// Show whether the game is already in a collection. Browser only, once the
// page has hydrated, so the server-rendered button never changes under Vue.
const auth = useAuth()
const collections = useCollections()
const tracked = ref(false)
onMounted(() => {
  onNuxtReady(async () => {
    await auth.ensureLoaded()
    if (auth.status.value !== 'signedIn' || !game.value) return
    try {
      const membership = await collections.membership(game.value.id)
      tracked.value = membership.collectionIds.length > 0
    } catch {
      // Only a hint. The menu loads the real state when opened.
    }
  })
})

function goBack() {
  if (window.history.state?.back) router.back()
  else void navigateTo('/')
}
</script>

<template>
  <div v-if="game" class="flex flex-col gap-10">
    <div>
      <Button variant="ghost" size="sm" class="-ml-2" @click="goBack">
        <ArrowLeft />
        {{ $t('game.back') }}
      </Button>
    </div>

    <section class="grid gap-8 md:grid-cols-[16rem_1fr]">
      <GameCover
        :name="game.name"
        :cover-id="game.coverId"
        class="w-48 md:w-full"
      />

      <div class="flex flex-col gap-6">
        <div>
          <Badge variant="outline" class="text-muted-foreground">
            {{ $t('game.fromIgdb') }}
          </Badge>
          <h1 class="mt-3 text-4xl font-bold">{{ game.name }}</h1>
          <p v-if="game.releaseDate" class="mt-1 text-muted-foreground">
            {{
              $t('game.released', {
                date: formatReleaseDate(game.releaseDate, locale),
              })
            }}
          </p>
          <div class="mt-4">
            <AddToCollectionMenu
              v-model:tracked="tracked"
              :game="{
                igdbId: game.id,
                name: game.name,
                coverId: game.coverId,
              }"
            />
          </div>
        </div>

        <dl class="grid gap-4 text-sm sm:grid-cols-2">
          <div v-if="game.developers.length">
            <dt class="font-medium text-muted-foreground">
              {{ $t('game.developer') }}
            </dt>
            <dd class="mt-1">{{ game.developers.join(', ') }}</dd>
          </div>
          <div v-if="game.publishers.length">
            <dt class="font-medium text-muted-foreground">
              {{ $t('game.publisher') }}
            </dt>
            <dd class="mt-1">{{ game.publishers.join(', ') }}</dd>
          </div>
          <div v-if="game.genres.length">
            <dt class="font-medium text-muted-foreground">
              {{ $t('game.genres') }}
            </dt>
            <dd class="mt-1">
              <ul class="flex flex-wrap gap-1" :aria-label="$t('game.genres')">
                <li v-for="genre in game.genres" :key="genre">
                  <Badge variant="outline">{{ genre }}</Badge>
                </li>
              </ul>
            </dd>
          </div>
          <div v-if="game.platforms.length">
            <dt class="font-medium text-muted-foreground">
              {{ $t('game.platforms') }}
            </dt>
            <dd class="mt-1">
              <ul
                class="flex flex-wrap gap-1"
                :aria-label="$t('game.platforms')"
              >
                <li
                  v-for="platform in game.platforms"
                  :key="platform"
                  class="max-w-full min-w-0"
                >
                  <PlatformPill :name="platform" />
                </li>
              </ul>
            </dd>
          </div>
        </dl>

        <div>
          <h2 class="text-xl font-semibold">{{ $t('game.about') }}</h2>
          <p
            v-if="game.summary"
            class="mt-2 max-w-prose leading-relaxed whitespace-pre-line"
          >
            {{ game.summary }}
          </p>
          <p v-else class="mt-2 text-muted-foreground">
            {{ $t('game.noSummary') }}
          </p>
        </div>
      </div>
    </section>

    <section v-if="game.screenshotIds.length">
      <h2 class="text-xl font-semibold">{{ $t('game.screenshots') }}</h2>
      <ul class="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
        <li v-for="(imageId, index) in game.screenshotIds" :key="imageId">
          <img
            :src="igdbImageUrl(imageId, 'screenshot_med')"
            :srcset="`${igdbImageUrl(imageId, 'screenshot_med')} 1x, ${igdbImageUrl(imageId, 'screenshot_big')} 2x`"
            :alt="
              $t('game.screenshotAlt', { number: index + 1, name: game.name })
            "
            loading="lazy"
            decoding="async"
            class="aspect-video w-full rounded-md bg-muted object-cover ring-1 ring-border"
          />
        </li>
      </ul>
    </section>

    <aside
      class="flex flex-wrap items-center justify-between gap-2 rounded-md border bg-card px-4 py-3 text-sm text-muted-foreground"
    >
      <p>{{ $t('game.igdbNote') }}</p>
      <a
        v-if="game.igdbUrl"
        :href="game.igdbUrl"
        target="_blank"
        rel="noopener"
        class="inline-flex items-center gap-1 font-medium text-primary underline-offset-4 hover:underline"
      >
        {{ $t('game.viewOnIgdb') }}
        <ExternalLink class="size-3.5" aria-hidden="true" />
      </a>
    </aside>
  </div>
</template>
