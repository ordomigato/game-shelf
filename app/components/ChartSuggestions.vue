<script setup lang="ts">
import { ChartColumn, ChartLine, ChartPie, Hash, Plus } from '@lucide/vue'
import type { Component } from 'vue'
import type { ChartKind, ChartWidget } from '#shared/types/charts'
import type { FieldDefinition } from '#shared/types/collection'
import { defaultTitle } from '#shared/utils/charts'

/** Suggested charts to add in one click, one at a time or all together. */
const props = defineProps<{
  suggestions: ChartWidget[]
  fields: FieldDefinition[]
}>()
const emit = defineEmits<{ add: [widgets: ChartWidget[]] }>()

const { t } = useI18n()

const icons: Record<ChartKind, Component> = {
  number: Hash,
  bar: ChartColumn,
  pie: ChartPie,
  line: ChartLine,
}

function titleOf(widget: ChartWidget) {
  const message = defaultTitle(widget, props.fields)
  return t(message.key, message.params ?? {})
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <ul class="grid gap-2 sm:grid-cols-2">
      <li
        v-for="widget in suggestions"
        :key="widget.id"
        class="flex items-center gap-3 rounded-md border bg-card px-3 py-2"
      >
        <component
          :is="icons[widget.kind]"
          class="size-4 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <span class="min-w-0 flex-1 truncate text-sm">{{
          titleOf(widget)
        }}</span>
        <Button
          size="sm"
          variant="ghost"
          :aria-label="
            $t('charts.suggestions.addOne', { title: titleOf(widget) })
          "
          @click="emit('add', [widget])"
        >
          <Plus /> {{ $t('charts.suggestions.add') }}
        </Button>
      </li>
    </ul>
    <Button
      v-if="suggestions.length > 1"
      variant="outline"
      class="self-start"
      @click="emit('add', suggestions)"
    >
      {{ $t('charts.suggestions.addAll', { count: suggestions.length }) }}
    </Button>
  </div>
</template>
