<script setup lang="ts">
import type { FollowRow } from '#shared/types/follows'

/**
 * An account's Following or Followers list, newest first, 50 at a time.
 * On your own Followers list each row has a menu to remove or block.
 */
const props = defineProps<{
  username: string
  kind: 'following' | 'followers'
}>()

const { t } = useI18n()
const auth = useAuth()
const follows = useFollows()

const rows = ref<FollowRow[]>([])
const next = ref<string | null>(null)
const status = ref<'loading' | 'ready' | 'hidden' | 'error'>('loading')
const loadingMore = ref(false)
const loadMoreFailed = ref(false)

const isMine = computed(
  () => auth.me.value?.username === props.username.toLowerCase(),
)

async function load() {
  status.value = 'loading'
  try {
    await auth.ensureLoaded()
    const page = await follows.page(props.username, props.kind)
    rows.value = page.items
    next.value = page.next
    status.value = 'ready'
    if (isMine.value && props.kind === 'followers') {
      await follows.markFollowersSeen().catch(() => {})
    }
  } catch (error) {
    status.value = isNotFound(error) ? 'hidden' : 'error'
  }
}

async function loadMore() {
  if (!next.value) return
  loadingMore.value = true
  loadMoreFailed.value = false
  try {
    const page = await follows.page(props.username, props.kind, next.value)
    rows.value = [...rows.value, ...page.items]
    next.value = page.next
  } catch {
    loadMoreFailed.value = true
  } finally {
    loadingMore.value = false
  }
}

function drop(row: FollowRow) {
  rows.value = rows.value.filter((other) => other.username !== row.username)
}

function setFollowing(row: FollowRow, following: boolean) {
  row.following = following
  row.mutual = following && row.followsYou
}

watch(() => [props.username, props.kind], load, { immediate: true })

useHead(() => ({
  title: t('app.title', {
    page: t(
      props.kind === 'following'
        ? 'follows.followingTitle'
        : 'follows.followersTitle',
      { username: props.username },
    ),
  }),
}))
</script>

<template>
  <div class="mx-auto flex w-full max-w-2xl flex-col gap-6">
    <div class="flex flex-col gap-1">
      <NuxtLink
        :to="`/u/${username}/shelf`"
        class="text-sm text-muted-foreground hover:underline"
      >
        {{
          $t('collection.back', {
            shelf: $t('shelf.userTitle', { username }),
          })
        }}
      </NuxtLink>
      <h1 class="text-3xl font-bold">
        {{
          kind === 'following'
            ? $t('follows.followingTitle', { username })
            : $t('follows.followersTitle', { username })
        }}
      </h1>
    </div>

    <div
      v-if="status === 'loading'"
      class="flex flex-col gap-2"
      aria-hidden="true"
    >
      <Skeleton v-for="n in 4" :key="n" class="h-14 rounded-lg" />
    </div>

    <div v-else-if="status === 'hidden'" class="py-12 text-center">
      <p class="text-lg font-medium">{{ $t('follows.hiddenTitle') }}</p>
      <p class="mt-1 text-muted-foreground">{{ $t('follows.hiddenBody') }}</p>
    </div>

    <div v-else-if="status === 'error'" class="py-12 text-center">
      <p class="text-lg font-medium">{{ $t('follows.loadFailed') }}</p>
      <Button class="mt-4" @click="load">{{ $t('shelf.retry') }}</Button>
    </div>

    <p v-else-if="!rows.length" class="py-12 text-center text-muted-foreground">
      {{
        kind === 'following'
          ? isMine
            ? $t('follows.emptyFollowingMine')
            : $t('follows.emptyFollowing', { username })
          : isMine
            ? $t('follows.emptyFollowersMine')
            : $t('follows.emptyFollowers', { username })
      }}
    </p>

    <template v-else>
      <ul class="flex flex-col gap-2">
        <li
          v-for="row in rows"
          :key="row.username"
          class="flex items-center justify-between gap-3 rounded-lg border bg-card p-3"
        >
          <NuxtLink
            :to="`/u/${row.username}/shelf`"
            class="flex min-w-0 flex-col outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <span class="truncate font-medium">
              {{ row.displayName || row.username }}
            </span>
            <span class="truncate text-sm text-muted-foreground">
              @{{ row.username }}
            </span>
          </NuxtLink>
          <div class="flex shrink-0 items-center gap-2">
            <Badge v-if="row.mutual" variant="secondary">
              {{ $t('follows.mutual') }}
            </Badge>
            <template v-if="!row.isYou">
              <FollowButton
                :username="row.username"
                :following="row.following"
                :follows-you="row.followsYou"
                size="sm"
                @update:following="setFollowing(row, $event)"
              />
              <AccountMenu
                v-if="isMine && kind === 'followers'"
                :username="row.username"
                can-remove
                :blocking="false"
                @removed="drop(row)"
                @blocked="drop(row)"
              />
            </template>
          </div>
        </li>
      </ul>
      <div v-if="next" class="text-center">
        <Button variant="outline" :disabled="loadingMore" @click="loadMore">
          {{ loadingMore ? $t('search.loadingMore') : $t('search.showMore') }}
        </Button>
        <p v-if="loadMoreFailed" class="mt-2 text-sm text-muted-foreground">
          {{ $t('search.loadMoreFailed') }}
        </p>
      </div>
    </template>
  </div>
</template>
