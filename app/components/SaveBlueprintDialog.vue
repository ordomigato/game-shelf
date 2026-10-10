<script setup lang="ts">
import { FetchError } from 'ofetch'
import type { Blueprint } from '#shared/types/collection'
import {
  BLUEPRINT_NAME_MAX_LENGTH,
  blueprintNameProblem,
} from '#shared/utils/blueprint-names'

/**
 * Names a collection's fields and saves them as a set, so new collections
 * can start with them. The collection keeps the same fields. Emits the
 * saved blueprint.
 */
const props = defineProps<{ collectionId: string }>()
const emit = defineEmits<{ saved: [blueprint: Blueprint] }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const collections = useCollections()

const name = ref('')
const saving = ref(false)
const error = ref('')

watch(open, (isOpen) => {
  if (!isOpen) return
  name.value = ''
  error.value = ''
})

const canSave = computed(() => !saving.value && name.value.trim() !== '')

async function save() {
  const problem = blueprintNameProblem(name.value)
  error.value = problem ? t(problem.key, problem.params ?? {}) : ''
  if (error.value) return
  saving.value = true
  try {
    emit(
      'saved',
      await collections.saveBlueprint(props.collectionId, name.value.trim()),
    )
    open.value = false
  } catch (e) {
    error.value =
      e instanceof FetchError && e.statusCode === 409
        ? t('blueprints.nameTaken')
        : t('blueprints.saveFailed')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent>
      <DialogHeader>
        <DialogTitle>{{ $t('blueprints.saveTitle') }}</DialogTitle>
        <DialogDescription>{{
          $t('blueprints.saveDescription')
        }}</DialogDescription>
      </DialogHeader>
      <form class="flex flex-col gap-4" @submit.prevent="save">
        <div class="flex flex-col gap-2">
          <Label for="blueprint-name">{{ $t('blueprints.name') }}</Label>
          <Input
            id="blueprint-name"
            v-model="name"
            :maxlength="BLUEPRINT_NAME_MAX_LENGTH"
            :placeholder="$t('blueprints.namePlaceholder')"
            required
          />
        </div>
        <FormMessage v-if="error">{{ error }}</FormMessage>
        <DialogFooter>
          <Button type="button" variant="outline" @click="open = false">
            {{ $t('blueprints.cancel') }}
          </Button>
          <Button type="submit" :disabled="!canSave">
            {{ saving ? $t('blueprints.saving') : $t('blueprints.save') }}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  </Dialog>
</template>
