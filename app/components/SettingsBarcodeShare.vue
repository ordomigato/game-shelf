<script setup lang="ts">
import type { BarcodeSuggestion } from '#shared/types/barcode'

/** Settings' list of the user's barcode picks to share with ScanDex. */
const sharing = useBarcodeSharing()
const items = ref<BarcodeSuggestion[] | null>(null)
const failed = ref(false)
// A new list starts a new ticked list, so the component is keyed by this.
const round = ref(0)

async function load() {
  failed.value = false
  try {
    items.value = await sharing.list()
    round.value += 1
  } catch {
    failed.value = true
  }
}

onMounted(load)
</script>

<template>
  <Card data-testid="share-settings">
    <CardHeader>
      <CardTitle>
        <h2 class="text-lg font-semibold">
          {{ $t('scanShare.settingsTitle') }}
        </h2>
      </CardTitle>
      <CardDescription>{{ $t('scanShare.description') }}</CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      <FormMessage v-if="failed">{{ $t('scanShare.loadFailed') }}</FormMessage>
      <p v-else-if="!items" class="text-sm text-muted-foreground">
        {{ $t('scanShare.loading') }}
      </p>
      <p v-else-if="!items.length" class="text-sm text-muted-foreground">
        {{ $t('scanShare.empty') }}
      </p>
      <BarcodeShare v-else :key="round" :items="items" @close="load" />
    </CardContent>
  </Card>
</template>
