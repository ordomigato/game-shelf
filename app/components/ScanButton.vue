<script setup lang="ts">
import { ScanBarcode } from '@lucide/vue'
import type { ListName } from '#shared/types/collection'
import type { ScanCollection } from '~/composables/useBarcodeScanner'

/**
 * Opens the barcode scanner. Visitors who are signed out go to sign in
 * first, then back to this page. `list` and `collection` say where a scan
 * started from, so a batch scanned on a collection joins it.
 */
const props = defineProps<{
  list?: ListName
  collection?: ScanCollection
  /** An icon only, for a tight spot like the search bar. */
  iconOnly?: boolean
}>()

const auth = useAuth()
const route = useRoute()
const scanner = useBarcodeScanner()

async function press() {
  await auth.ensureLoaded()
  if (auth.status.value !== 'signedIn') {
    await navigateTo({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  scanner.start({ list: props.list, collection: props.collection })
}
</script>

<template>
  <Button
    type="button"
    :variant="iconOnly ? 'ghost' : 'outline'"
    :size="iconOnly ? 'icon' : 'default'"
    :aria-label="$t('scan.buttonLabel')"
    data-testid="scan-button"
    @click="press"
  >
    <ScanBarcode />
    <!-- Icon only on phones, where the row of buttons runs out of room. -->
    <span v-if="!iconOnly" class="hidden sm:inline">{{
      $t('scan.button')
    }}</span>
  </Button>
</template>
