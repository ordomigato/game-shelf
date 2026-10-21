<script setup lang="ts">
definePageMeta({ middleware: 'auth' })

// The parent page stays mounted while tabs change, and its `useRoute()` keeps
// the route it was first rendered with, so read the router's live route.
const router = useRouter()
const currentPath = computed(() => router.currentRoute.value.path)

const auth = useAuth()

// ScanDex is only listed for accounts allowed to share barcodes.
const allTabs = [
  { to: '/account', labelKey: 'account.tabs.profile' },
  { to: '/account/security', labelKey: 'account.tabs.security' },
  { to: '/account/fields', labelKey: 'account.tabs.fields' },
  { to: '/account/usage', labelKey: 'account.tabs.usage' },
  {
    to: '/account/scandex',
    labelKey: 'account.tabs.scandex',
    contributors: true,
  },
  { to: '/account/settings', labelKey: 'account.tabs.settings' },
]
const tabs = computed(() =>
  allTabs.filter(
    (tab) => !tab.contributors || auth.me.value?.contributesBarcodes,
  ),
)
</script>

<template>
  <div class="mx-auto flex w-full max-w-2xl flex-col gap-6">
    <h1 class="text-3xl font-bold">{{ $t('account.title') }}</h1>
    <nav :aria-label="$t('account.sections')" class="border-b">
      <ul class="-mb-px flex gap-6">
        <li v-for="tab in tabs" :key="tab.to">
          <NuxtLink
            :to="tab.to"
            class="inline-block border-b-2 py-2 text-sm font-medium transition-colors"
            :class="
              currentPath === tab.to
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            "
            :aria-current="currentPath === tab.to ? 'page' : undefined"
          >
            {{ $t(tab.labelKey) }}
          </NuxtLink>
        </li>
      </ul>
    </nav>
    <NuxtPage />
  </div>
</template>
