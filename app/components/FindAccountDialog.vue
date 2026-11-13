<script setup lang="ts">
import { UserSearch } from '@lucide/vue'
import type { Relationship } from '#shared/types/follows'
import type { PublicProfile } from '#shared/types/user'

/**
 * "Find an account": a full username only, so nobody can list accounts. The
 * profile route answers 404 for a name nobody has. A match shows as one row
 * to follow or open.
 */
const auth = useAuth()
const collections = useCollections()

const open = ref(false)
const lookup = ref('')
const found = ref<PublicProfile | null>(null)
const problem = ref<'notFound' | 'failed' | null>(null)
const looking = ref(false)
const relationship = ref<Relationship | null>(null)
// Bumped on every edit, so a slow answer to an earlier name is dropped.
let attempt = 0

function clear() {
  attempt += 1
  found.value = null
  problem.value = null
  relationship.value = null
  looking.value = false
}

watch(open, (isOpen) => {
  if (isOpen) return
  lookup.value = ''
  clear()
})

const initial = computed(() => found.value?.username.charAt(0).toUpperCase())
const avatarStyle = computed(() => {
  const { from, to } = generatedCoverColors(found.value?.username ?? '')
  return { backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }
})
const isMe = computed(
  () => !!found.value && auth.me.value?.username === found.value.username,
)
const canFollow = computed(
  () =>
    !!found.value &&
    !isMe.value &&
    auth.status.value === 'signedIn' &&
    relationship.value !== null &&
    !relationship.value.blocking,
)

async function find() {
  const name = usernameToFind(lookup.value)
  clear()
  if (!name) {
    problem.value = 'notFound'
    return
  }
  const mine = attempt
  looking.value = true
  try {
    const profile = await collections.profile(name)
    if (mine !== attempt) return
    found.value = profile
    relationship.value = profile.relationship ?? null
  } catch (e) {
    if (mine !== attempt) return
    problem.value =
      (e as { statusCode?: number }).statusCode === 404 ? 'notFound' : 'failed'
  } finally {
    if (mine === attempt) looking.value = false
  }
}

function setFollowing(following: boolean) {
  if (relationship.value) relationship.value.following = following
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogTrigger as-child>
      <Button variant="outline" size="sm">
        <UserSearch />
        {{ $t('explore.findAccount') }}
      </Button>
    </DialogTrigger>
    <DialogContent class="sm:max-w-md">
      <DialogHeader>
        <DialogTitle>{{ $t('explore.findAccount') }}</DialogTitle>
        <DialogDescription>
          {{ $t('explore.findAccountHint') }}
        </DialogDescription>
      </DialogHeader>
      <form class="flex gap-2" @submit.prevent="find">
        <Input
          v-model="lookup"
          autofocus
          autocomplete="off"
          autocapitalize="none"
          spellcheck="false"
          :aria-label="$t('explore.findAccount')"
          :placeholder="$t('explore.findAccountPlaceholder')"
          @input="clear"
        />
        <Button type="submit" :disabled="looking">
          {{ $t('explore.findAccountButton') }}
        </Button>
      </form>
      <p v-if="problem" role="alert" class="text-sm text-muted-foreground">
        {{
          problem === 'notFound'
            ? $t('explore.findAccountNotFound')
            : $t('explore.findAccountFailed')
        }}
      </p>
      <div
        v-else-if="found"
        class="flex flex-wrap items-center gap-3 rounded-lg border p-3"
      >
        <span
          class="grid size-10 shrink-0 place-items-center rounded-full text-base font-semibold text-white"
          :style="avatarStyle"
          aria-hidden="true"
        >
          {{ initial }}
        </span>
        <div class="min-w-0 flex-1">
          <p v-if="found.displayName" class="truncate font-medium">
            {{ found.displayName }}
          </p>
          <p
            class="truncate text-sm"
            :class="found.displayName ? 'text-muted-foreground' : 'font-medium'"
          >
            @{{ found.username }}
          </p>
        </div>
        <div class="flex items-center gap-2">
          <FollowButton
            v-if="canFollow"
            :username="found.username"
            :following="relationship?.following ?? false"
            :follows-you="relationship?.followedBy"
            size="sm"
            @update:following="setFollowing"
          />
          <Button variant="outline" size="sm" as-child>
            <NuxtLink :to="`/u/${found.username}/shelf`" @click="open = false">
              {{ $t('explore.viewShelf') }}
            </NuxtLink>
          </Button>
        </div>
      </div>
    </DialogContent>
  </Dialog>
</template>
