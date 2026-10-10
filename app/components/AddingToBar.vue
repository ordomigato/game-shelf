<script setup lang="ts">
import type { CollectionSummary } from '#shared/types/collection'

/**
 * Shown above search results when searching on behalf of one collection.
 * Says which collection results go into, lets the user switch to another,
 * and links back to it with Done.
 */
const props = defineProps<{
  target: CollectionSummary
  collections: CollectionSummary[]
  username: string
}>()
const emit = defineEmits<{ change: [slug: string] }>()

const titleOf = useCollectionTitle()

function choose(slug: unknown) {
  if (typeof slug === 'string' && slug !== props.target.slug)
    emit('change', slug)
}
</script>

<template>
  <div
    class="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm"
  >
    <i18n-t keypath="addToCollection.addingTo" tag="p" class="min-w-0">
      <template #collection>
        <strong class="font-semibold">{{ titleOf(target) }}</strong>
      </template>
    </i18n-t>
    <div class="flex items-center gap-2">
      <DropdownMenu v-if="collections.length > 1">
        <DropdownMenuTrigger as-child>
          <Button variant="outline" size="sm">
            {{ $t('addToCollection.change') }}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" class="w-56">
          <DropdownMenuRadioGroup
            :model-value="target.slug"
            @update:model-value="choose"
          >
            <DropdownMenuRadioItem
              v-for="collection in collections"
              :key="collection.id"
              :value="collection.slug"
            >
              {{ titleOf(collection) }}
            </DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button as-child size="sm">
        <NuxtLink :to="`/u/${username}/shelf/${target.slug}`">
          {{ $t('addToCollection.done') }}
        </NuxtLink>
      </Button>
    </div>
  </div>
</template>
