<script setup lang="ts">
import { Pencil, Unlink } from '@lucide/vue'
import type {
  Blueprint,
  CollectionEntry,
  FieldDefinition,
} from '#shared/types/collection'
import { valuesLost } from '#shared/utils/field-changes'

/**
 * Edits a collection's own fields and saves them all at once. When saving
 * would clear values (a removed field, or values that don't fit a new
 * type), it says how many games are affected first.
 *
 * Fields that come from a blueprint are edited in one place, the
 * blueprint's page, so then this says where they come from and offers to
 * go there or to detach the collection and edit its own copy here.
 */
const props = defineProps<{
  collectionId: string
  fields: FieldDefinition[]
  /** The collection's games, to count values a change would clear. */
  items: CollectionEntry[]
  blueprint: Pick<Blueprint, 'id' | 'name' | 'shared' | 'usedBy'>
  /** While the page detaches the collection from its blueprint. */
  detaching?: boolean
}>()
const emit = defineEmits<{ saved: [blueprint: Blueprint]; detach: [] }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const collections = useCollections()
const editor = useFieldDrafts()

const confirming = ref(false)
/** Ticked to confirm values will be deleted. */
const acknowledged = ref(false)
/** Problems show once saving has been tried, not while typing. */
const attempted = ref(false)
const saving = ref(false)
const error = ref('')

// Fresh drafts when opening, and after detaching hands over a copy.
watch(
  () => [open.value, props.blueprint.shared, props.blueprint.id] as const,
  ([isOpen]) => {
    if (!isOpen) return
    editor.reset(props.fields)
    confirming.value = false
    acknowledged.value = false
    attempted.value = false
    error.value = ''
  },
  { immediate: true },
)

/** Values saving would clear, with the field's old name. */
const losses = computed(() => {
  const lost = valuesLost(
    props.items,
    props.fields,
    editor.nextFields.value,
    editor.renames.value,
  )
  return props.fields
    .filter((field) => lost.has(field.id))
    .map((field) => ({ name: field.name, count: lost.get(field.id)! }))
})

/** Fields being removed that no game in this collection has a value for. */
const emptyRemovals = computed(() => {
  const kept = new Set(editor.nextFields.value.map((field) => field.id))
  const losing = new Set(losses.value.map((loss) => loss.name))
  return props.fields
    .filter((field) => !kept.has(field.id) && !losing.has(field.name))
    .map((field) => field.name)
})

async function save() {
  attempted.value = true
  if (editor.problem.value) return
  // Stop to confirm whenever a field goes away or values would be deleted.
  if (
    (losses.value.length || emptyRemovals.value.length) &&
    !confirming.value
  ) {
    acknowledged.value = false
    confirming.value = true
    return
  }
  if (losses.value.length && !acknowledged.value) return
  saving.value = true
  error.value = ''
  try {
    const blueprint = await collections.updateFields(
      props.collectionId,
      editor.nextFields.value,
      editor.renames.value,
    )
    emit('saved', blueprint)
    open.value = false
  } catch {
    error.value = t('fieldEditor.saveFailed')
  } finally {
    saving.value = false
  }
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

      <!-- Fields from a blueprint: edited on its page, or detached. -->
      <template v-if="blueprint.shared">
        <div class="flex flex-col gap-3 rounded-md border bg-accent p-4">
          <p class="font-medium">
            {{
              $t('fieldEditor.fromBlueprint', { name: blueprint.name ?? '' })
            }}
          </p>
          <p class="text-sm text-muted-foreground">
            {{
              $t(
                'fieldEditor.blueprintUsedBy',
                { count: blueprint.usedBy ?? 1 },
                blueprint.usedBy ?? 1,
              )
            }}
          </p>
          <div class="flex flex-wrap gap-2">
            <Button as-child>
              <NuxtLink :to="`/blueprints/${blueprint.id}`">
                <Pencil /> {{ $t('fieldEditor.editBlueprint') }}
              </NuxtLink>
            </Button>
            <Button
              variant="outline"
              :disabled="detaching"
              @click="emit('detach')"
            >
              <Unlink /> {{ $t('fieldEditor.detachAndEdit') }}
            </Button>
          </div>
        </div>
        <ul
          class="flex flex-wrap gap-1.5"
          :aria-label="$t('fieldEditor.title')"
        >
          <li v-for="field in fields" :key="field.id">
            <Badge variant="secondary">{{ field.name }}</Badge>
          </li>
        </ul>
        <DialogFooter>
          <Button variant="outline" @click="open = false">
            {{ $t('fieldEditor.close') }}
          </Button>
        </DialogFooter>
      </template>

      <template v-else>
        <!-- Confirm removed fields and values that would be deleted -->
        <div v-if="confirming" class="flex flex-col gap-3">
          <p class="font-medium">{{ $t('fieldEditor.reviewTitle') }}</p>
          <DataLossWarning
            v-model:acknowledged="acknowledged"
            :losses="losses"
            :empty-removals="emptyRemovals"
          />
        </div>

        <form v-else id="fields-form" @submit.prevent="save">
          <FieldsEditor :editor="editor" />
        </form>

        <FormMessage v-if="attempted && editor.problem.value && !confirming">{{
          editor.problem.value
        }}</FormMessage>
        <FormMessage v-if="error">{{ error }}</FormMessage>

        <DialogFooter>
          <Button
            v-if="confirming"
            type="button"
            variant="outline"
            @click="confirming = false"
          >
            {{ $t('fieldEditor.back') }}
          </Button>
          <Button v-else type="button" variant="outline" @click="open = false">
            {{ $t('fieldEditor.cancel') }}
          </Button>
          <Button
            v-if="confirming"
            type="button"
            :class="
              losses.length
                ? 'bg-destructive text-white hover:bg-destructive/90'
                : undefined
            "
            :disabled="saving || (losses.length > 0 && !acknowledged)"
            @click="save"
          >
            {{
              saving
                ? $t('fieldEditor.saving')
                : losses.length
                  ? $t('dataLoss.deleteAndSave')
                  : $t('fieldEditor.save')
            }}
          </Button>
          <Button v-else type="submit" form="fields-form" :disabled="saving">
            {{ saving ? $t('fieldEditor.saving') : $t('fieldEditor.save') }}
          </Button>
        </DialogFooter>
      </template>
    </DialogContent>
  </Dialog>
</template>
