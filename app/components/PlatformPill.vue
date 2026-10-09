<script setup lang="ts">
const props = defineProps<{ name: string }>()

/** Names longer than this may be cut off, so they get a full-name tooltip. */
const MAX_PLAIN_LENGTH = 16

const mayTruncate = computed(() => props.name.length > MAX_PLAIN_LENGTH)
</script>

<template>
  <Tooltip v-if="mayTruncate">
    <TooltipTrigger as-child>
      <Badge
        variant="secondary"
        tabindex="0"
        class="max-w-full text-[11px] outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span class="min-w-0 truncate">{{ name }}</span>
      </Badge>
    </TooltipTrigger>
    <TooltipContent>{{ name }}</TooltipContent>
  </Tooltip>
  <Badge v-else variant="secondary" class="max-w-full text-[11px]">
    <span class="min-w-0 truncate">{{ name }}</span>
  </Badge>
</template>
