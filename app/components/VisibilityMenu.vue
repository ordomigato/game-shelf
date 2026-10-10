<script setup lang="ts">
import { Check, ChevronDown, Globe, Lock } from '@lucide/vue'
import type { CollectionVisibility } from '#shared/types/collection'

/**
 * Who can see a collection, for its owner to change: private (only them)
 * or public (anyone with the link, and listed on their shelf).
 */
defineProps<{
  visibility: CollectionVisibility
  /** The Wishlist's public option also mentions hearts in collections. */
  isWishlist?: boolean
  disabled?: boolean
}>()
const emit = defineEmits<{ change: [visibility: CollectionVisibility] }>()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="outline"
        size="sm"
        :disabled="disabled"
        :aria-label="
          $t('visibility.label', {
            current:
              visibility === 'public'
                ? $t('shelf.public')
                : $t('shelf.private'),
          })
        "
      >
        <Globe v-if="visibility === 'public'" />
        <Lock v-else />
        {{ visibility === 'public' ? $t('shelf.public') : $t('shelf.private') }}
        <ChevronDown class="text-muted-foreground" />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="start" class="w-72">
      <DropdownMenuItem
        class="items-start"
        @select="visibility !== 'private' && emit('change', 'private')"
      >
        <Lock class="mt-0.5" />
        <span class="flex flex-1 flex-col gap-0.5">
          <span class="font-medium">{{ $t('shelf.private') }}</span>
          <span class="text-xs text-muted-foreground">
            {{ $t('visibility.privateHint') }}
          </span>
        </span>
        <Check v-if="visibility === 'private'" class="mt-0.5" />
      </DropdownMenuItem>
      <DropdownMenuItem
        class="items-start"
        @select="visibility !== 'public' && emit('change', 'public')"
      >
        <Globe class="mt-0.5" />
        <span class="flex flex-1 flex-col gap-0.5">
          <span class="font-medium">{{ $t('shelf.public') }}</span>
          <span class="text-xs text-muted-foreground">
            {{
              isWishlist
                ? $t('visibility.publicWishlistHint')
                : $t('visibility.publicHint')
            }}
          </span>
        </span>
        <Check v-if="visibility === 'public'" class="mt-0.5" />
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
