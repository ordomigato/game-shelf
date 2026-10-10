<script setup lang="ts">
import { ChartColumn, Plus } from '@lucide/vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { ChartSize, ChartWidget } from '#shared/types/charts'
import type { FieldDefinition } from '#shared/types/collection'
import { MAX_CHARTS, type ChartItem } from '#shared/utils/charts'

/**
 * A collection's charts, in a grid of three columns (one on phones).
 * Charts are small, medium or wide (1, 2 or 3 columns). Owners add, edit,
 * resize, drag into place and remove them. Every change emits the whole
 * new list to save.
 */
const props = defineProps<{
  dashboard: ChartWidget[]
  fields: FieldDefinition[]
  items: ChartItem[]
  editable: boolean
}>()
const emit = defineEmits<{ save: [dashboard: ChartWidget[]] }>()

const editing = ref(false)
const editingWidget = ref<ChartWidget | undefined>()

/** The list as dragged, so the drop shows before the save comes back. */
const widgets = ref<ChartWidget[]>([])
watch(
  () => props.dashboard,
  (dashboard) => {
    widgets.value = [...dashboard]
  },
  { immediate: true },
)

function startAdding() {
  editingWidget.value = undefined
  editing.value = true
}

function startEditing(widget: ChartWidget) {
  editingWidget.value = widget
  editing.value = true
}

function onSaved(widget: ChartWidget) {
  const exists = widgets.value.some((entry) => entry.id === widget.id)
  emit(
    'save',
    exists
      ? widgets.value.map((entry) => (entry.id === widget.id ? widget : entry))
      : [...widgets.value, widget],
  )
}

function resize(widget: ChartWidget, size: ChartSize) {
  emit(
    'save',
    widgets.value.map((entry) =>
      entry.id === widget.id ? { ...entry, size } : entry,
    ),
  )
}

function remove(widget: ChartWidget) {
  emit(
    'save',
    widgets.value.filter((entry) => entry.id !== widget.id),
  )
}

function onReordered() {
  emit('save', [...widgets.value])
}

const span: Record<ChartSize, string> = {
  small: 'md:col-span-1',
  medium: 'md:col-span-2',
  large: 'md:col-span-3',
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <div v-if="editable && widgets.length" class="flex justify-end">
      <Button :disabled="widgets.length >= MAX_CHARTS" @click="startAdding">
        <Plus /> {{ $t('charts.add') }}
      </Button>
    </div>

    <div
      v-if="!widgets.length"
      class="flex flex-col items-center gap-3 rounded-lg border border-dashed py-12 text-center"
    >
      <ChartColumn class="size-8 text-muted-foreground" aria-hidden="true" />
      <p class="font-medium">{{ $t('charts.empty') }}</p>
      <template v-if="editable">
        <p class="max-w-md text-sm text-muted-foreground">
          {{ $t('charts.emptyHint') }}
        </p>
        <Button @click="startAdding">
          <Plus /> {{ $t('charts.addFirst') }}
        </Button>
      </template>
    </div>

    <VueDraggable
      v-else
      v-model="widgets"
      tag="ul"
      class="grid gap-4 md:grid-cols-3"
      handle=".chart-handle"
      ghost-class="drag-gap"
      :animation="150"
      :disabled="!editable"
      @update="onReordered"
    >
      <li v-for="widget in widgets" :key="widget.id" :class="span[widget.size]">
        <ChartCard
          :widget="widget"
          :fields="fields"
          :items="items"
          :editable="editable"
          @edit="startEditing(widget)"
          @resize="resize(widget, $event)"
          @remove="remove(widget)"
        />
      </li>
    </VueDraggable>

    <ChartEditorDialog
      v-if="editable"
      v-model:open="editing"
      :widget="editingWidget"
      :fields="fields"
      :items="items"
      @save="onSaved"
    />
  </div>
</template>
