<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { BlockedAccount } from '#shared/types/follows'

/** The accounts the user has blocked, each with an Unblock button. */
const { t } = useI18n()
const follows = useFollows()

const accounts = ref<BlockedAccount[] | null>(null)
const failed = ref(false)
const busy = ref<string | null>(null)

async function load() {
  failed.value = false
  try {
    accounts.value = await follows.blocked()
  } catch {
    failed.value = true
  }
}

async function unblock(account: BlockedAccount) {
  busy.value = account.username
  try {
    await follows.unblock(account.username)
    accounts.value =
      accounts.value?.filter((other) => other.username !== account.username) ??
      null
  } catch {
    toast.error(t('follows.failed'))
  } finally {
    busy.value = null
  }
}

onMounted(load)
</script>

<template>
  <div>
    <div v-if="failed" class="flex flex-col items-start gap-2">
      <FormMessage>{{ $t('follows.loadFailed') }}</FormMessage>
      <Button variant="outline" @click="load">{{ $t('shelf.retry') }}</Button>
    </div>
    <p
      v-else-if="accounts && !accounts.length"
      class="text-sm text-muted-foreground"
    >
      {{ $t('follows.noBlocked') }}
    </p>
    <ul v-else-if="accounts" class="flex flex-col gap-2">
      <li
        v-for="account in accounts"
        :key="account.username"
        class="flex items-center justify-between gap-3 rounded-lg border p-3"
      >
        <span class="flex min-w-0 flex-col">
          <span class="truncate font-medium">
            {{ account.displayName || account.username }}
          </span>
          <span class="truncate text-sm text-muted-foreground">
            @{{ account.username }}
          </span>
        </span>
        <Button
          variant="outline"
          size="sm"
          :disabled="busy === account.username"
          @click="unblock(account)"
        >
          {{ $t('follows.unblock') }}
        </Button>
      </li>
    </ul>
    <Skeleton v-else class="h-14 rounded-lg" aria-hidden="true" />
  </div>
</template>
