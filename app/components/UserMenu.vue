<script setup lang="ts">
import { CircleUser, Library, LogOut } from '@lucide/vue'

const auth = useAuth()
const { t } = useI18n()
const route = useRoute()

/**
 * While the real check is still running (and during server rendering), the
 * `gs_user` cookie decides which button to draw, so the header doesn't jump
 * after a refresh.
 */
const signedIn = computed(
  () =>
    auth.status.value === 'signedIn' ||
    (auth.status.value === 'loading' && Boolean(auth.hint.value)),
)
const username = computed(
  () => auth.me.value?.username ?? auth.hint.value?.username ?? null,
)
const label = computed(() => username.value ?? t('header.account'))
const shelfPath = computed(() =>
  username.value ? `/u/${username.value}/shelf` : null,
)

async function signOut() {
  await auth.signOut()
  await navigateTo('/')
}
</script>

<template>
  <Button
    v-if="signedIn && shelfPath"
    as-child
    class="hidden bg-highlight text-highlight-foreground hover:bg-highlight/85 sm:inline-flex"
  >
    <NuxtLink :to="shelfPath">
      <Library class="size-5" aria-hidden="true" />
      {{ $t('header.myShelf') }}
    </NuxtLink>
  </Button>
  <DropdownMenu v-if="signedIn">
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        class="text-masthead-foreground hover:bg-masthead-foreground/15 hover:text-masthead-foreground aria-expanded:bg-masthead-foreground/15 aria-expanded:text-masthead-foreground"
      >
        <CircleUser class="size-5" />
        <span class="max-w-32 truncate">{{ label }}</span>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <!-- On phones the header has no room for the My shelf button. -->
      <DropdownMenuItem v-if="shelfPath" as-child class="sm:hidden">
        <NuxtLink :to="shelfPath">
          {{ $t('header.myShelf') }}
        </NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuItem as-child>
        <NuxtLink to="/account">
          {{ $t('header.account') }}
        </NuxtLink>
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuItem @select="signOut">
        <LogOut /> {{ $t('header.signOut') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
  <Button
    v-else
    as-child
    variant="ghost"
    class="text-masthead-foreground hover:bg-masthead-foreground/15 hover:text-masthead-foreground"
  >
    <NuxtLink
      :to="{
        path: '/login',
        query: route.path === '/' ? {} : { redirect: route.fullPath },
      }"
    >
      {{ $t('header.signIn') }}
    </NuxtLink>
  </Button>
</template>
