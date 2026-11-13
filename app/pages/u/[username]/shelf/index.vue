<script setup lang="ts">
import { Plus } from '@lucide/vue'
import { toast } from 'vue-sonner'
import type { CollectionSummary, ListSummary } from '#shared/types/collection'
import type { FollowCounts, Relationship } from '#shared/types/follows'

const route = useRoute()
const { t } = useI18n()
const collections = useCollections()
const auth = useAuth()

const username = computed(() => String(route.params.username).toLowerCase())
const isMine = computed(() => collections.isMine(username.value))

const { data, status, error, refresh } = useAsyncData(
  () => `shelf-${username.value}`,
  () => collections.list(username.value),
  { watch: [username] },
)

// Owned and the Wishlist: both for the owner, the public ones for visitors.
const { data: lists } = useAsyncData(
  () => `shelf-lists-${username.value}`,
  () => collections.lists(username.value),
  { watch: [username] },
)
/** A list shown like a collection, with its page's address as its slug. */
const listCards = computed<CollectionSummary[]>(() =>
  (lists.value ?? []).map((summary: ListSummary) => ({
    id: summary.list,
    title: summary.list === 'owned' ? t('shelf.owned') : t('shelf.wishlist'),
    slug: summary.list,
    description: null,
    color: null,
    visibility: summary.visibility,
    itemCount: summary.itemCount,
    updatedAt: '',
  })),
)

const { data: profile, refresh: refreshProfile } = useAsyncData(
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

// The profile answers for this viewer, so the page asks for it once. The
// server render has no sign-in, so a signed-in viewer asks again in the
// browser. Counts and relationship are kept locally, so a follow or a block
// shows at once.
const counts = ref<FollowCounts | null>(null)
const relationship = ref<Relationship | null>(null)
watch(
  profile,
  (loaded) => {
    counts.value = loaded?.counts ?? null
    relationship.value = loaded?.relationship ?? null
  },
  { immediate: true },
)
const renderedOnServer = useNuxtApp().isHydrating
onMounted(async () => {
  if (!renderedOnServer) return
  await auth.ensureLoaded()
  if (auth.status.value === 'signedIn') await refreshProfile()
})
/** Asks for the counts again after the viewer follows, unfollows or blocks. */
async function refreshCounts() {
  try {
    counts.value = (await collections.profile(username.value)).counts
  } catch {
    // Keep the counts shown.
  }
}
const canFollow = computed(
  () =>
    !isMine.value &&
    (auth.status.value === 'signedOut' ||
      (relationship.value !== null && !relationship.value.blocking)),
)
function setFollowing(following: boolean) {
  if (relationship.value) relationship.value.following = following
  void refreshCounts()
}
function afterBlock(blocking: boolean) {
  relationship.value = {
    following: false,
    followedBy: false,
    blocking,
  }
  void refreshCounts()
}

useHead(() => ({
  title: t('app.title', {
    page: isMine.value
      ? t('shelf.myTitle')
      : t('shelf.userTitle', { username: shelfOwner.value }),
  }),
}))

const creating = ref(false)

// The plan's collection limit, shown next to New collection so reaching it
// never comes as a surprise.
const { limits } = usePlan()
const ownCollections = computed(() => data.value?.length ?? 0)
const atLimit = computed(() => ownCollections.value >= limits.value.collections)

// The sidebar's New collection button links here with `?new=1`.
const router = useRouter()
watch(
  [isMine, () => route.query.new, data],
  ([mine, wantsNew, loaded]) => {
    if (!mine || wantsNew !== '1' || !loaded) return
    if (atLimit.value) {
      toast.info(
        t('limits.reached.collections', { limit: limits.value.collections }),
      )
    } else {
      creating.value = true
    }
    void router.replace({ query: { ...route.query, new: undefined } })
  },
  { immediate: true },
)

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
            <template v-if="relationship?.followedBy">
              ·
              {{
                relationship.following
                  ? $t('follows.mutual')
                  : $t('follows.followsYou')
              }}
            </template>
          </p>
          <p v-if="counts" class="text-sm text-muted-foreground">
            <NuxtLink :to="`/u/${username}/following`" class="hover:underline">
              {{ $t('follows.followingCount', { count: counts.following }) }}
            </NuxtLink>
            ·
            <NuxtLink :to="`/u/${username}/followers`" class="hover:underline">
              {{
                $t(
                  'follows.followersCount',
                  { count: counts.followers },
                  counts.followers,
                )
              }}
            </NuxtLink>
            <Badge
              v-if="isMine && (auth.me.value?.newFollowers ?? 0) > 0"
              variant="secondary"
              class="ml-2"
            >
              {{
                $t('follows.newFollowers', {
                  count: auth.me.value?.newFollowers ?? 0,
                })
              }}
            </Badge>
          </p>
          <p
            v-if="isMine && data"
            class="text-sm text-muted-foreground"
            :class="{
              'font-medium text-destructive':
                ownCollections > limits.collections,
            }"
          >
            {{
              $t('limits.collectionsUsed', {
                used: ownCollections,
                limit: limits.collections,
              })
            }}
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
          <FollowButton
            v-if="canFollow"
            :username="username"
            :following="relationship?.following ?? false"
            :follows-you="relationship?.followedBy"
            @update:following="setFollowing"
          />
          <AccountMenu
            v-if="relationship"
            :username="username"
            :can-remove="relationship.followedBy"
            :blocking="relationship.blocking"
            @removed="relationship.followedBy = false"
            @blocked="afterBlock(true)"
            @unblocked="afterBlock(false)"
          />
          <Button v-if="isMine" :disabled="atLimit" @click="creating = true">
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
        v-else-if="data && !data.length && !listCards.length"
        class="py-12 text-center text-muted-foreground"
      >
        {{
          isMine
            ? $t('shelf.emptyMine')
            : $t('shelf.emptyVisitor', { username })
        }}
      </p>

      <ul v-else-if="data" class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <li v-for="card in listCards" :key="card.id">
          <CollectionCard
            :collection="card"
            :username="username"
            :show-visibility="isMine"
          />
        </li>
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
