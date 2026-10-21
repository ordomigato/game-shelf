<script setup lang="ts">
import type { BarcodeSuggestion } from '#shared/types/barcode'

/** The user's barcode picks to share with ScanDex. Not found for others. */
const auth = useAuth()
if (!auth.me.value?.contributesBarcodes) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Page not found',
    fatal: true,
  })
}

const { t } = useI18n()
useHead(() => ({
  title: t('app.title', { page: t('account.tabs.scandex') }),
}))

const sharing = useBarcodeSharing()
const items = ref<BarcodeSuggestion[] | null>(null)
const failed = ref(false)

async function load() {
  failed.value = false
  try {
    items.value = await sharing.list()
  } catch {
    failed.value = true
  }
}

onMounted(load)
</script>

<template>
  <Card data-testid="scandex-page">
    <CardHeader>
      <CardTitle>
        <h2 class="text-lg font-semibold">
          {{ $t('scanShare.settingsTitle') }}
        </h2>
      </CardTitle>
      <CardDescription>{{ $t('scanShare.description') }}</CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      <div v-if="failed" class="flex flex-col items-start gap-2">
        <FormMessage>{{ $t('scanShare.loadFailed') }}</FormMessage>
        <Button type="button" variant="outline" size="sm" @click="load">
          {{ $t('scanShare.retry') }}
        </Button>
      </div>
      <p v-if="!items && !failed" class="text-sm text-muted-foreground">
        {{ $t('scanShare.loading') }}
      </p>
      <p
        v-else-if="items && !items.length"
        class="text-sm text-muted-foreground"
      >
        {{ $t('scanShare.empty') }}
      </p>
      <BarcodeShare v-else-if="items" list :items="items" @sent="load" />
    </CardContent>
  </Card>
</template>
