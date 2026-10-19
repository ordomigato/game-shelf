<script setup lang="ts">
import type { FieldDefinition, FieldsImpact } from '#shared/types/collection'

/**
 * Edits the user's fields and saves them all at once. Saving first asks the
 * server what it would change across every game. When a removed field or
 * values that don't fit a new type would be deleted, it says how many games
 * are affected and needs a tick before it saves.
 */
const props = defineProps<{
  /** The fields as saved now. Editing starts over when they change. */
  fields: FieldDefinition[]
  /** Shows a Cancel button, for use in a dialog. */
  cancellable?: boolean
}>()
const emit = defineEmits<{ saved: [fields: FieldDefinition[]]; cancel: [] }>()

const { t } = useI18n()
const accountFields = useAccountFields()
const editor = useFieldDrafts()

/** What saving would change, while asking to confirm. */
const impact = ref<FieldsImpact | null>(null)
/** Ticked to confirm values will be deleted. */
const acknowledged = ref(false)
/** Problems show once saving has been tried, not while typing. */
const attempted = ref(false)
const saving = ref(false)
const error = ref('')

watch(
  () => props.fields,
  (fields) => {
    editor.reset(fields)
    impact.value = null
    acknowledged.value = false
    attempted.value = false
    error.value = ''
  },
  { immediate: true },
)

/** Removed fields that no game has a value for. */
const emptyRemovals = computed(() => {
  if (!impact.value) return []
  const kept = new Set(editor.nextFields.value.map((field) => field.id))
  const losing = new Set(impact.value.lost.map((loss) => loss.name))
  return props.fields
    .filter((field) => !kept.has(field.id) && !losing.has(field.name))
    .map((field) => field.name)
})

const losses = computed(() => impact.value?.lost ?? [])

async function save() {
  saving.value = true
  error.value = ''
  try {
    const saved = await accountFields.save(
      editor.nextFields.value,
      editor.renames.value,
    )
    emit('saved', saved)
  } catch (e) {
    error.value = limitMessage(e, t) ?? t('fieldEditor.saveFailed')
  } finally {
    saving.value = false
  }
}

/**
 * Checks what saving would change. Saves straight away when nothing is
 * removed or deleted, and otherwise stops to confirm.
 */
async function review() {
  attempted.value = true
  if (editor.problem.value) return
  saving.value = true
  error.value = ''
  try {
    const result = await accountFields.preview(
      editor.nextFields.value,
      editor.renames.value,
    )
    const kept = new Set(editor.nextFields.value.map((field) => field.id))
    const removing = props.fields.some((field) => !kept.has(field.id))
    if (!result.lost.length && !removing) {
      await save()
      return
    }
    impact.value = result
    acknowledged.value = false
  } catch (e) {
    error.value = limitMessage(e, t) ?? t('fieldEditor.previewFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="flex flex-col gap-4">
    <!-- Confirm removed fields and values that would be deleted -->
    <div v-if="impact" class="flex flex-col gap-3">
      <p class="font-medium">{{ $t('fieldEditor.reviewTitle') }}</p>
      <p class="text-sm text-muted-foreground">
        {{ $t('fieldEditor.reviewAllGames') }}
      </p>
      <DataLossWarning
        v-model:acknowledged="acknowledged"
        :losses="losses"
        :empty-removals="emptyRemovals"
      />
    </div>

    <form v-else id="fields-form" @submit.prevent="review">
      <FieldsEditor :editor="editor" />
    </form>

    <FormMessage v-if="attempted && editor.problem.value && !impact">{{
      editor.problem.value
    }}</FormMessage>
    <FormMessage v-if="error">{{ error }}</FormMessage>

    <DialogFooter>
      <Button
        v-if="impact"
        type="button"
        variant="outline"
        @click="impact = null"
      >
        {{ $t('fieldEditor.back') }}
      </Button>
      <Button
        v-else-if="cancellable"
        type="button"
        variant="outline"
        @click="emit('cancel')"
      >
        {{ $t('fieldEditor.cancel') }}
      </Button>
      <Button
        v-if="impact"
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
  </div>
</template>
