<script setup lang="ts">
import type { FieldDefinition } from '#shared/types/collection'

/**
 * The user's fields in a dialog, opened from a collection. They're the same
 * for every game and every collection, and the dialog says so.
 */
defineProps<{ fields: FieldDefinition[] }>()
const emit = defineEmits<{ saved: [fields: FieldDefinition[]] }>()
const open = defineModel<boolean>('open', { default: false })

function onSaved(fields: FieldDefinition[]) {
  emit('saved', fields)
  open.value = false
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
      <DialogHeader>
        <DialogTitle>{{ $t('fieldEditor.title') }}</DialogTitle>
        <DialogDescription>{{
          $t('fieldEditor.description')
        }}</DialogDescription>
      </DialogHeader>
      <FieldsPanel
        :fields="fields"
        cancellable
        @saved="onSaved"
        @cancel="open = false"
      />
    </DialogContent>
  </Dialog>
</template>
