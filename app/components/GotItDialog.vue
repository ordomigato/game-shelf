<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { CollectionSummary } from '#shared/types/collection'

/**
 * Offered after "Got it" moves a game to Owned: tick some of the user's
 * collections to add it to as well. Only the ticked ones are sent. If that's refused (a plan limit, say), the dialog
 * stays open.
 */
const props = defineProps<{
  itemId: string | null
  itemName: string
  collections: CollectionSummary[]
  /** Collections the game is already in, which aren't offered. */
  alreadyIn?: string[]
}>()
const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  /** A collection that was ticked has been deleted. */
  missing: []
}>()

const { t } = useI18n()
const library = useCollections()
const sidebar = useMyCollections()
const route = useRoute()

const { limits } = usePlan()
// The game isn't in any of the choices, so a full one can't take it.
const isFull = (collection: CollectionSummary) =>
  collectionFullFor(collection, limits.value.gamesPerCollection, false)

const selected = ref(new Set<string>())
const saving = ref(false)

const choices = computed(() =>
  props.collections.filter(
    (collection) => !props.alreadyIn?.includes(collection.id),
  ),
)

watch(open, (isOpen) => {
  if (isOpen) selected.value = new Set()
})

function toggle(id: string, on: boolean) {
  const next = new Set(selected.value)
  if (on) next.add(id)
  else next.delete(id)
  selected.value = next
}

async function add() {
  if (!props.itemId || saving.value || !selected.value.size) return
  saving.value = true
  const joined = choices.value.filter((collection) =>
    selected.value.has(collection.id),
  )
  const names = joined.map((collection) => collection.title).join(', ')
  try {
    await library.setItemCollections(props.itemId, {
      add: joined.map(({ id }) => id),
      remove: [],
    })
  } catch (error) {
    if (isNotFound(error)) {
      void sidebar.refresh()
      emit('missing')
    }
    toast.error(
      limitMessage(error, t) ?? t('table.addToFailed', { collection: names }),
    )
    return
  } finally {
    saving.value = false
  }
  open.value = false
  const only = joined.length === 1 ? joined[0] : undefined
  toast.success(
    t('table.addedTo', { collection: names }),
    only && {
      action: {
        label: t('table.view'),
        onClick: () =>
          navigateTo(`/u/${String(route.params.username)}/shelf/${only.slug}`),
      },
    },
  )
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ $t('gotIt.title', { name: itemName }) }}</DialogTitle>
        <DialogDescription>{{ $t('gotIt.description') }}</DialogDescription>
      </DialogHeader>
      <ul class="flex max-h-72 flex-col gap-3 overflow-y-auto">
        <li
          v-for="collection in choices"
          :key="collection.id"
          class="flex items-center gap-3"
        >
          <Checkbox
            :id="`got-it-${collection.id}`"
            :model-value="selected.has(collection.id)"
            :disabled="isFull(collection)"
            @update:model-value="toggle(collection.id, $event === true)"
          />
          <Label :for="`got-it-${collection.id}`">{{ collection.title }}</Label>
          <span
            v-if="isFull(collection)"
            class="text-xs text-muted-foreground"
            >{{ $t('addToCollection.full') }}</span
          >
        </li>
      </ul>
      <DialogFooter>
        <Button type="button" variant="outline" @click="open = false">
          {{ $t('gotIt.skip') }}
        </Button>
        <Button type="button" :disabled="saving || !selected.size" @click="add">
          {{ saving ? $t('gotIt.adding') : $t('gotIt.add') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
