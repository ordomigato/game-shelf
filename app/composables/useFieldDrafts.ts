import type {
  FieldDefinition,
  FieldType,
  RatingScale,
} from '#shared/types/collection'
import {
  DEFAULT_CURRENCY,
  FIELD_TYPES,
  RATING_SCALES,
  cleanFields,
  fieldsProblem,
  type OptionRenames,
} from '#shared/utils/field-changes'

export interface OptionDraft {
  key: string
  value: string
  /** The option's name when editing started, to spot renames. */
  original?: string
}

export interface FieldDraft {
  key: string
  id: string
  name: string
  type: FieldType
  options: OptionDraft[]
  currency: string
  scale: RatingScale
}

/**
 * The editable copy of a list of fields, shared by the collection's field
 * editor and the blueprint page. `nextFields` and `renames` are what gets
 * saved, `problem` why it can't be yet.
 */
export function useFieldDrafts() {
  const { t } = useI18n()
  const drafts = ref<FieldDraft[]>([])
  const newKey = () => crypto.randomUUID()

  function reset(fields: FieldDefinition[]) {
    drafts.value = fields.map((field) => ({
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
  }

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
  }

  /** The fields in a new order, after dragging. */
  function setOrder(list: FieldDraft[]) {
    drafts.value = list
  }

  function removeField(key: string) {
    drafts.value = drafts.value.filter((draft) => draft.key !== key)
  }

  const isChoiceList = (draft: FieldDraft) =>
    draft.type === 'select' || draft.type === 'multiselect'

  function addOption(draft: FieldDraft) {
    draft.options = [...draft.options, { key: newKey(), value: '' }]
  }

  function removeOption(draft: FieldDraft, key: string) {
    draft.options = draft.options.filter((option) => option.key !== key)
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

  function setScale(draft: FieldDraft, value: unknown) {
    const scale = Number(value) as RatingScale
    if (RATING_SCALES.includes(scale)) draft.scale = scale
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

  return {
    drafts,
    reset,
    addField,
    setOrder,
    removeField,
    isChoiceList,
    addOption,
    removeOption,
    setType,
    setScale,
    nextFields,
    renames,
    problem,
  }
}

export type FieldDrafts = ReturnType<typeof useFieldDrafts>
