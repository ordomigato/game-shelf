<script setup lang="ts">
import type { CollectionSummary, LibraryItem } from '#shared/types/collection'

/**
 * Adds a game IGDB doesn't have, like a homebrew or a bootleg, to one
 * collection. It gets a generated cover, and works like any other game.
 */
const props = defineProps<{
  collection: Pick<CollectionSummary, 'id' | 'title' | 'kind'>
  /** Prefilled, e.g. with what was searched for. */
  initialName?: string
}>()
const emit = defineEmits<{ added: [item: LibraryItem] }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const collections = useCollections()
const titleOf = useCollectionTitle()

const name = ref('')
const saving = ref(false)
const error = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  name.value = props.initialName?.trim() ?? ''
  error.value = ''
})

const canSave = computed(() => !saving.value && name.value.trim() !== '')

async function save() {
  if (!canSave.value) return
  saving.value = true
  error.value = ''
  try {
    const { item } = await collections.addManualGame(
      name.value.trim(),
      props.collection.id,
    )
    emit('added', item)
    open.value = false
  } catch {
    error.value = t('byHand.failed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ $t('byHand.title') }}</DialogTitle>
        <DialogDescription>
          {{ $t('byHand.description', { collection: titleOf(collection) }) }}
        </DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="save">
        <div class="flex flex-col gap-2">
          <Label for="by-hand-name">{{ $t('byHand.name') }}</Label>
          <Input
            id="by-hand-name"
            v-model="name"
            maxlength="200"
            :placeholder="$t('byHand.namePlaceholder')"
          />
        </div>
        <FormMessage v-if="error">{{ error }}</FormMessage>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">
            {{ $t('byHand.cancel') }}
          </Button>
          <Button type="submit" :disabled="!canSave">
            {{ saving ? $t('byHand.adding') : $t('byHand.add') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
