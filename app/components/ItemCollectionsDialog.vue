<script setup lang="ts">
import type {
  CollectionEntry,
  CollectionSummary,
} from '#shared/types/collection'

/**
 * Pick which of the user's collections a game from Owned or the Wishlist
 * is in: a checklist of all of them, applied on Save. Emits the ticked ids.
 * The parent closes the dialog once they're saved.
 */
const props = defineProps<{
  item: CollectionEntry | null
  collections: CollectionSummary[]
  saving: boolean
}>()
const emit = defineEmits<{ save: [collectionIds: string[]] }>()
const open = defineModel<boolean>('open', { default: false })

const selected = ref(new Set<string>())

watch(open, (isOpen) => {
  if (!isOpen) return
  selected.value = new Set(
    props.item?.inCollections?.map((collection) => collection.id),
  )
})

function toggle(id: string, on: boolean) {
  const next = new Set(selected.value)
  if (on) next.add(id)
  else next.delete(id)
  selected.value = next
}

function save() {
  emit(
    'save',
    props.collections
      .filter((collection) => selected.value.has(collection.id))
      .map((collection) => collection.id),
  )
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{
          $t('itemCollections.title', { name: item?.name ?? '' })
        }}</DialogTitle>
        <DialogDescription>{{
          $t('itemCollections.description')
        }}</DialogDescription>
      </DialogHeader>
      <p v-if="!collections.length" class="text-sm text-muted-foreground">
        {{ $t('itemCollections.none') }}
      </p>
      <ul v-else class="flex max-h-72 flex-col gap-3 overflow-y-auto">
        <li
          v-for="collection in collections"
          :key="collection.id"
          class="flex items-center gap-3"
        >
          <Checkbox
            :id="`item-collections-${collection.id}`"
            :model-value="selected.has(collection.id)"
            :disabled="saving"
            @update:model-value="toggle(collection.id, $event === true)"
          />
          <Label :for="`item-collections-${collection.id}`">{{
            collection.title
          }}</Label>
        </li>
      </ul>
      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          :disabled="saving"
          @click="open = false"
        >
          {{ $t('itemCollections.cancel') }}
        </Button>
        <Button
          type="button"
          :disabled="saving || !collections.length"
          @click="save"
        >
          {{
            saving ? $t('itemCollections.saving') : $t('itemCollections.save')
          }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
