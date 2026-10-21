<script setup lang="ts">
import { Star } from '@lucide/vue'
import type { PlatformOption } from '#shared/types/collection'

/**
 * A game's platforms as chips: the ones it's owned on as plain chips, and
 * the ones it's on the Wishlist for as outline chips with a star. Used
 * inside the cell's button for the owner and on its own for visitors.
 */
defineProps<{ owned: PlatformOption[]; wanted: PlatformOption[] }>()
</script>

<template>
  <Badge
    v-for="platform in owned"
    :key="`owned-${platform.id}`"
    as="span"
    variant="secondary"
    class="text-[11px]"
    :title="platform.name"
  >
    {{ platform.name }}
  </Badge>
  <Badge
    v-for="platform in wanted"
    :key="`wanted-${platform.id}`"
    as="span"
    variant="outline"
    class="gap-1 text-[11px] text-muted-foreground"
    :title="`${platform.name} (${$t('table.wishlist')})`"
  >
    <Star class="size-3" aria-hidden="true" />
    {{ platform.name }}
    <span class="sr-only">{{ $t('table.wishlist') }}</span>
  </Badge>
</template>
