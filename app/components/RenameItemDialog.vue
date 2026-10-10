<script setup lang="ts">
import type { CollectionEntry, LibraryItem } from '#shared/types/collection'

/**
 * Renames the user's own copy of a game. The name changes in all their
 * collections. The game stays linked to IGDB.
 */
const props = defineProps<{ item: CollectionEntry | null }>()
const emit = defineEmits<{ saved: [item: LibraryItem] }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const collections = useCollections()

const name = ref('')
const saving = ref(false)
const error = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  name.value = props.item?.name ?? ''
  error.value = ''
})

const canSave = computed(
  () =>
    !saving.value &&
    name.value.trim() !== '' &&
    name.value.trim() !== props.item?.name,
)

async function save() {
  if (!props.item || !canSave.value) return
  saving.value = true
  error.value = ''
  try {
    emit(
      'saved',
      await collections.renameItem(props.item.id, name.value.trim()),
    )
    open.value = false
  } catch {
    error.value = t('rename.failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ $t('rename.title') }}</DialogTitle>
        <DialogDescription>{{ $t('rename.description') }}</DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="save">
        <div class="flex flex-col gap-2">
          <Label for="rename-item">{{ $t('rename.name') }}</Label>
          <Input id="rename-item" v-model="name" maxlength="200" />
        </div>
        <FormMessage v-if="error">{{ error }}</FormMessage>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">
            {{ $t('rename.cancel') }}
          </Button>
          <Button type="submit" :disabled="!canSave">
            {{ saving ? $t('rename.saving') : $t('rename.save') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
