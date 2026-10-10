<script setup lang="ts">
import { GripVertical, Plus, Trash2, X } from '@lucide/vue'
import { VueDraggable } from 'vue-draggable-plus'
import type {
  Blueprint,
  CollectionEntry,
  FieldDefinition,
  FieldType,
  RatingScale,
} from '#shared/types/collection'
import {
  DEFAULT_CURRENCY,
  FIELD_TYPES,
  MAX_FIELDS,
  RATING_SCALES,
  cleanFields,
  fieldsProblem,
  valuesLost,
  type OptionRenames,
} from '#shared/utils/field-changes'

/**
 * Edits a collection's fields: add, rename, reorder, remove, change type,
 * and edit a select's options or an amount's currency. Saves everything at
 * once. When saving would clear values (a removed field, or values that
 * don't fit a new type), it says how many games are affected first.
 */
const props = defineProps<{
  collectionId: string
  fields: FieldDefinition[]
  /** The collection's games, to count values a change would clear. */
  items: CollectionEntry[]
}>()
const emit = defineEmits<{ saved: [blueprint: Blueprint] }>()
const open = defineModel<boolean>('open', { default: false })

const { t, locale } = useI18n()
const collections = useCollections()

interface OptionDraft {
  key: string
  value: string
  /** The option's name when the editor opened, to spot renames. */
  original?: string
}
interface FieldDraft {
  key: string
  id: string
  name: string
  type: FieldType
  options: OptionDraft[]
  currency: string
  scale: RatingScale
}

const drafts = ref<FieldDraft[]>([])
const confirming = ref(false)
/** Problems show once saving has been tried, not while typing. */
const attempted = ref(false)
const saving = ref(false)
const error = ref('')

const newKey = () => crypto.randomUUID()

watch(open, (isOpen) => {
  if (!isOpen) return
  drafts.value = props.fields.map((field) => ({
    key: newKey(),
    id: field.id,
    name: field.name,
    type: field.type,
    options: (field.options ?? []).map((option) => ({
      key: newKey(),
      value: option,
      original: option,
    })),
    currency: field.currency ?? DEFAULT_CURRENCY,
    scale: field.scale ?? 5,
  }))
  confirming.value = false
  attempted.value = false
  error.value = ''
})

function addField() {
  drafts.value = [
    ...drafts.value,
    {
      key: newKey(),
      id: crypto.randomUUID(),
      name: '',
      type: 'text',
      options: [],
      currency: DEFAULT_CURRENCY,
      scale: 5,
    },
  ]
  void nextTick(() => {
    const inputs =
      document.querySelectorAll<HTMLInputElement>('[data-field-name]')
    inputs[inputs.length - 1]?.focus()
  })
}

function removeField(key: string) {
  drafts.value = drafts.value.filter((draft) => draft.key !== key)
}

function setType(draft: FieldDraft, type: unknown) {
  if (typeof type !== 'string' || !FIELD_TYPES.includes(type as FieldType)) {
    return
  }
  // Choosing "Choice list" again keeps a multiple-choice list as it is.
  if (type === 'select' && draft.type === 'multiselect') return
  draft.type = type as FieldType
  if (draft.type === 'select' && !draft.options.length) addOption(draft)
}

const isChoiceList = (draft: FieldDraft) =>
  draft.type === 'select' || draft.type === 'multiselect'

function addOption(draft: FieldDraft) {
  draft.options = [...draft.options, { key: newKey(), value: '' }]
}

function removeOption(draft: FieldDraft, key: string) {
  draft.options = draft.options.filter((option) => option.key !== key)
}

const nextFields = computed(() =>
  cleanFields(
    drafts.value.map((draft) => ({
      id: draft.id,
      name: draft.name,
      type: draft.type,
      options: draft.options.map((option) => option.value),
      currency: draft.currency,
      scale: draft.scale,
    })),
  ),
)

const renames = computed<OptionRenames>(() => {
  const result: OptionRenames = {}
  for (const draft of drafts.value) {
    if (!isChoiceList(draft)) continue
    const moved = draft.options.filter(
      (option) =>
        option.original !== undefined &&
        option.value.trim() &&
        option.value.trim() !== option.original,
    )
    if (moved.length) {
      result[draft.id] = Object.fromEntries(
        moved.map((option) => [option.original!, option.value.trim()]),
      )
    }
  }
  return result
})

const problem = computed(() => {
  const found = fieldsProblem(nextFields.value)
  return found ? t(found.key, found.params ?? {}) : ''
})

/** Values saving would clear, with the field's old name. */
const losses = computed(() => {
  const lost = valuesLost(
    props.items,
    props.fields,
    nextFields.value,
    renames.value,
  )
  return props.fields
    .filter((field) => lost.has(field.id))
    .map((field) => ({ name: field.name, count: lost.get(field.id)! }))
})

const types: { type: FieldType; labelKey: string }[] = [
  { type: 'text', labelKey: 'fieldEditor.types.text' },
  { type: 'number', labelKey: 'fieldEditor.types.number' },
  { type: 'currency', labelKey: 'fieldEditor.types.currency' },
  { type: 'date', labelKey: 'fieldEditor.types.date' },
  { type: 'checkbox', labelKey: 'fieldEditor.types.checkbox' },
  { type: 'select', labelKey: 'fieldEditor.types.select' },
  { type: 'rating', labelKey: 'fieldEditor.types.rating' },
  { type: 'progress', labelKey: 'fieldEditor.types.progress' },
]

const scaleLabels = computed<Record<RatingScale, string>>(() => ({
  5: t('fieldEditor.scaleStars'),
  10: '10',
  100: '100',
}))

function setScale(draft: FieldDraft, value: unknown) {
  const scale = Number(value) as RatingScale
  if (RATING_SCALES.includes(scale)) draft.scale = scale
}

const CURRENCIES = [
  'USD',
  'EUR',
  'GBP',
  'CAD',
  'AUD',
  'NZD',
  'JPY',
  'CNY',
  'KRW',
  'INR',
  'CHF',
  'SEK',
  'NOK',
  'DKK',
  'PLN',
  'BRL',
  'MXN',
]
const currencyNames = computed(() => {
  const names = new Intl.DisplayNames(locale.value, { type: 'currency' })
  return Object.fromEntries(
    CURRENCIES.map((code) => [code, `${code} · ${names.of(code) ?? code}`]),
  )
})

async function save() {
  attempted.value = true
  if (problem.value) return
  if (losses.value.length && !confirming.value) {
    confirming.value = true
    return
  }
  saving.value = true
  error.value = ''
  try {
    const blueprint = await collections.updateFields(
      props.collectionId,
      nextFields.value,
      renames.value,
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

      <!-- Confirm values that would be cleared -->
      <div v-if="confirming" class="flex flex-col gap-3">
        <p class="font-medium">{{ $t('fieldEditor.confirmTitle') }}</p>
        <ul class="list-disc pl-5 text-muted-foreground">
          <li v-for="loss in losses" :key="loss.name">
            {{ $t('fieldEditor.cleared', { name: loss.name }, loss.count) }}
          </li>
        </ul>
        <p class="text-muted-foreground">{{ $t('fieldEditor.confirmBody') }}</p>
      </div>

      <form
        v-else
        id="fields-form"
        class="flex flex-col gap-3"
        @submit.prevent="save"
      >
        <p
          v-if="!drafts.length"
          class="rounded-lg border border-dashed py-6 text-center text-muted-foreground"
        >
          {{ $t('fieldEditor.empty') }}
        </p>
        <VueDraggable
          v-model="drafts"
          tag="ol"
          class="flex flex-col gap-3"
          handle=".field-handle"
          ghost-class="drag-gap"
          :animation="150"
        >
          <li
            v-for="draft in drafts"
            :key="draft.key"
            class="flex flex-col gap-3 rounded-lg border bg-card p-3"
          >
            <div class="flex items-center gap-2">
              <span
                class="field-handle flex cursor-grab touch-none items-center rounded-sm py-1 text-muted-foreground hover:text-foreground active:cursor-grabbing"
                :title="$t('table.drag')"
                aria-hidden="true"
              >
                <GripVertical class="size-4" />
              </span>
              <Input
                v-model="draft.name"
                data-field-name
                class="min-w-0 flex-1"
                :aria-label="$t('fieldEditor.name')"
                :placeholder="$t('fieldEditor.namePlaceholder')"
                maxlength="60"
              />
              <Select
                :model-value="
                  draft.type === 'multiselect' ? 'select' : draft.type
                "
                @update:model-value="setType(draft, $event)"
              >
                <SelectTrigger
                  class="w-36 shrink-0"
                  :aria-label="
                    $t('fieldEditor.typeFor', {
                      name: draft.name || $t('fieldEditor.newField'),
                    })
                  "
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="option in types"
                    :key="option.type"
                    :value="option.type"
                  >
                    {{ $t(option.labelKey) }}
                  </SelectItem>
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                class="shrink-0 text-muted-foreground hover:text-destructive"
                :aria-label="
                  $t('fieldEditor.remove', {
                    name: draft.name || $t('fieldEditor.newField'),
                  })
                "
                @click="removeField(draft.key)"
              >
                <Trash2 />
              </Button>
            </div>

            <!-- A choice list's options -->
            <div v-if="isChoiceList(draft)" class="flex flex-col gap-2 pl-6">
              <p class="text-xs font-medium text-muted-foreground">
                {{ $t('fieldEditor.options') }}
              </p>
              <div
                v-for="option in draft.options"
                :key="option.key"
                class="flex items-center gap-2"
              >
                <Input
                  v-model="option.value"
                  class="h-8"
                  maxlength="60"
                  :aria-label="
                    $t('fieldEditor.optionFor', {
                      name: draft.name || $t('fieldEditor.newField'),
                    })
                  "
                  @keydown.enter.prevent="addOption(draft)"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  class="shrink-0 text-muted-foreground"
                  :aria-label="
                    $t('fieldEditor.removeOption', {
                      option: option.value || $t('fieldEditor.emptyOption'),
                    })
                  "
                  @click="removeOption(draft, option.key)"
                >
                  <X />
                </Button>
              </div>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                class="self-start"
                @click="addOption(draft)"
              >
                <Plus /> {{ $t('fieldEditor.addOption') }}
              </Button>
              <Label class="flex items-center gap-2 font-normal">
                <Checkbox
                  :model-value="draft.type === 'multiselect'"
                  @update:model-value="
                    draft.type = $event === true ? 'multiselect' : 'select'
                  "
                />
                {{ $t('fieldEditor.allowMultiple') }}
              </Label>
            </div>

            <!-- An amount's currency -->
            <div
              v-else-if="draft.type === 'currency'"
              class="flex items-center gap-2 pl-6"
            >
              <span class="text-xs font-medium text-muted-foreground">
                {{ $t('fieldEditor.currency') }}
              </span>
              <Select v-model="draft.currency">
                <SelectTrigger
                  size="sm"
                  class="w-56"
                  :aria-label="
                    $t('fieldEditor.currencyFor', {
                      name: draft.name || $t('fieldEditor.newField'),
                    })
                  "
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="code in CURRENCIES"
                    :key="code"
                    :value="code"
                  >
                    {{ currencyNames[code] }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            <!-- What a score is out of -->
            <div
              v-else-if="draft.type === 'rating'"
              class="flex items-center gap-2 pl-6"
            >
              <span class="text-xs font-medium text-muted-foreground">
                {{ $t('fieldEditor.outOf') }}
              </span>
              <Select
                :model-value="String(draft.scale)"
                @update:model-value="setScale(draft, $event)"
              >
                <SelectTrigger
                  size="sm"
                  class="w-36"
                  :aria-label="
                    $t('fieldEditor.outOfFor', {
                      name: draft.name || $t('fieldEditor.newField'),
                    })
                  "
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem
                    v-for="scale in RATING_SCALES"
                    :key="scale"
                    :value="String(scale)"
                  >
                    {{ scaleLabels[scale] }}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </li>
        </VueDraggable>

        <Button
          type="button"
          variant="outline"
          class="self-start"
          :disabled="drafts.length >= MAX_FIELDS"
          @click="addField"
        >
          <Plus /> {{ $t('fieldEditor.add') }}
        </Button>
      </form>

      <FormMessage v-if="attempted && problem && !confirming">{{
        problem
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
          class="bg-destructive text-white hover:bg-destructive/90"
          :disabled="saving"
          @click="save"
        >
          {{ saving ? $t('fieldEditor.saving') : $t('fieldEditor.saveAnyway') }}
        </Button>
        <Button v-else type="submit" form="fields-form" :disabled="saving">
          {{ saving ? $t('fieldEditor.saving') : $t('fieldEditor.save') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
