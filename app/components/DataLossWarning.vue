<script setup lang="ts">
import { TriangleAlert } from '@lucide/vue'

/**
 * Shown before saving field changes. When values would be deleted, it says
 * so plainly, says it can't be undone, and needs a tick before the save
 * button works. Removed fields that hold no values get a quiet note.
 */
defineProps<{
  /** Per field, how many games would lose their value. */
  losses: { name: string; count: number }[]
  /** Fields being removed that no game has a value for. */
  emptyRemovals: string[]
}>()
const acknowledged = defineModel<boolean>('acknowledged', { default: false })
</script>

<template>
  <div class="flex flex-col gap-3">
    <Alert v-if="losses.length" variant="destructive">
      <TriangleAlert />
      <AlertTitle>{{ $t('dataLoss.title') }}</AlertTitle>
      <AlertDescription class="flex flex-col gap-2">
        <ul class="list-disc pl-5">
          <li v-for="loss in losses" :key="loss.name">
            {{ $t('dataLoss.field', { name: loss.name }, loss.count) }}
          </li>
        </ul>
        <p class="font-medium">{{ $t('dataLoss.cantUndo') }}</p>
      </AlertDescription>
    </Alert>
    <p
      v-for="name in emptyRemovals"
      :key="name"
      class="text-sm text-muted-foreground"
    >
      {{ $t('dataLoss.emptyRemoval', { name }) }}
    </p>
    <Label v-if="losses.length" class="flex items-center gap-2">
      <Checkbox v-model="acknowledged" />
      {{ $t('dataLoss.acknowledge') }}
    </Label>
  </div>
</template>
