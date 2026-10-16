<script setup lang="ts">
import type { SearchTarget } from '~/composables/useTrackedGames'

/**
 * Shown above search results when searching on behalf of one collection or
 * list. Says where results go, lets the user switch to another, and links
 * back to it with Done.
 */
const props = defineProps<{
  target: SearchTarget
  targets: SearchTarget[]
  username: string
}>()
const emit = defineEmits<{ change: [slug: string] }>()

function choose(slug: unknown) {
  if (typeof slug === 'string' && slug !== props.target.slug)
    emit('change', slug)
}
</script>

<template>
  <div
    class="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 shadow-sm"
  >
    <i18n-t
      scope="global"
      keypath="addToCollection.addingTo"
      tag="p"
      class="min-w-0"
    >
      <template #collection>
        <strong class="font-semibold">{{ target.title }}</strong>
      </template>
    </i18n-t>
    <div class="flex items-center gap-2">
      <DropdownMenu v-if="targets.length > 1">
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
              v-for="option in targets"
              :key="option.slug"
              :value="option.slug"
            >
              {{ option.title }}
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
