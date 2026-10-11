<script setup lang="ts">
import { LogOut } from '@lucide/vue'

/** The signed-in user's avatar, opening their account menu. */
const auth = useAuth()
const { username, shelfPath } = useViewer()

const initial = computed(() => (username.value ?? '?').charAt(0).toUpperCase())
const avatarStyle = computed(() => {
  const { from, to } = generatedCoverColors(username.value ?? '')
  return { backgroundImage: `linear-gradient(135deg, ${from}, ${to})` }
})

async function signOut() {
  await auth.signOut()
  await navigateTo('/')
}
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <button
        type="button"
        class="grid size-8 shrink-0 place-items-center rounded-full text-sm font-semibold text-white ring-offset-background outline-none focus-visible:ring-3 focus-visible:ring-ring/50 aria-expanded:ring-2 aria-expanded:ring-ring"
        :style="avatarStyle"
        :aria-label="$t('header.accountMenu')"
      >
        {{ initial }}
      </button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="min-w-48">
      <DropdownMenuLabel
        v-if="username"
        class="font-normal text-muted-foreground"
      >
        @{{ username }}
      </DropdownMenuLabel>
      <DropdownMenuItem v-if="shelfPath" as-child>
        <NuxtLink :to="shelfPath">{{ $t('header.myShelf') }}</NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuItem v-if="username" as-child>
        <NuxtLink to="/blueprints">{{ $t('header.blueprints') }}</NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuItem as-child>
        <NuxtLink to="/account">{{ $t('header.account') }}</NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem @select="signOut">
        <LogOut /> {{ $t('header.signOut') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
