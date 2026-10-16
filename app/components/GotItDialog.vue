<script setup lang="ts">
import { toast } from 'vue-sonner'
import type { CollectionSummary } from '#shared/types/collection'

/**
 * Offered after "Got it" moves a game to Owned: tick some of the user's
 * collections to add it to as well. Games are added one collection at a
 * time. If one is refused (a plan limit, say), the ones already added drop
 * off the list and the dialog stays open.
 */
const props = defineProps<{
  itemId: string | null
  itemName: string
  collections: CollectionSummary[]
  /** Collections the game is already in, which aren't offered. */
  alreadyIn?: string[]
}>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const library = useCollections()
const route = useRoute()

const selected = ref(new Set<string>())
const added = ref(new Set<string>())
const saving = ref(false)

const choices = computed(() =>
  props.collections.filter(
    (collection) =>
      !added.value.has(collection.id) &&
      !props.alreadyIn?.includes(collection.id),
  ),
)

watch(open, (isOpen) => {
  if (!isOpen) return
  selected.value = new Set()
  added.value = new Set()
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
  const done: CollectionSummary[] = []
  let failed: CollectionSummary | undefined
  try {
    for (const collection of choices.value) {
      if (!selected.value.has(collection.id)) continue
      failed = collection
      await library.addItem(collection.id, props.itemId)
      done.push(collection)
    }
    open.value = false
  } catch (error) {
    toast.error(
      limitMessage(error, t) ??
        t('table.addToFailed', {
          collection: failed ? failed.title : '',
        }),
    )
  } finally {
    saving.value = false
    const doneIds = done.map(({ id }) => id)
    added.value = new Set([...added.value, ...doneIds])
    selected.value = new Set(
      [...selected.value].filter((id) => !doneIds.includes(id)),
    )
    if (done.length) {
      const only = done.length === 1 ? done[0] : undefined
      toast.success(
        t('table.addedTo', {
          collection: done.map((collection) => collection.title).join(', '),
        }),
        only && {
          action: {
            label: t('table.view'),
            onClick: () =>
              navigateTo(
                `/u/${String(route.params.username)}/shelf/${only.slug}`,
              ),
          },
        },
      )
    }
  }
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
            @update:model-value="toggle(collection.id, $event === true)"
          />
          <Label :for="`got-it-${collection.id}`">{{ collection.title }}</Label>
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
