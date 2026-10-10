<script setup lang="ts">
import { Check, Star } from '@lucide/vue'
import type { FieldDefinition, FieldValue } from '#shared/types/collection'

/**
 * One item's value for one field, in the collection table. Owners edit in
 * place: checkboxes, ratings, selects and multiple choices save on click;
 * text, numbers and dates turn into an input, saving on Enter or when focus
 * leaves, and cancelling on Escape. Emits the new value, or null to clear
 * it.
 */
const props = defineProps<{
  field: FieldDefinition
  value: FieldValue | undefined
  itemName: string
  editable: boolean
}>()
const emit = defineEmits<{ save: [value: FieldValue | null] }>()

const { t, locale } = useI18n()

const text = computed(() =>
  formatFieldValue(props.field, props.value, locale.value),
)
const editLabel = computed(() =>
  t('table.editValue', { field: props.field.name, name: props.itemName }),
)

// Select values can't be empty, so "no value" gets a stand-in.
const NONE = '__none__'

const editing = ref(false)
const draft = ref('')
const input = useTemplateRef<{ $el: HTMLInputElement }>('input')

const inputType = computed(() => {
  switch (props.field.type) {
    case 'number':
    case 'currency':
    case 'progress':
      return 'number'
    case 'date':
      return 'date'
    default:
      return 'text'
  }
})

async function startEditing() {
  draft.value = props.value === undefined ? '' : String(props.value)
  editing.value = true
  await nextTick()
  input.value?.$el.focus()
  input.value?.$el.select?.()
}

/** The draft as a value to save, null to clear, or undefined if invalid. */
function parseDraft(): FieldValue | null | undefined {
  const raw = draft.value.trim()
  if (raw === '') return null
  if (inputType.value !== 'number') return raw
  const number = Number(raw)
  return Number.isFinite(number) ? number : undefined
}

function commit() {
  if (!editing.value) return
  editing.value = false
  const next = parseDraft()
  if (next === undefined || next === (props.value ?? null)) return
  emit('save', next)
}

function cancel() {
  editing.value = false
}

function rate(stars: number) {
  emit('save', props.value === stars ? null : stars)
}

const chosen = computed(() => (Array.isArray(props.value) ? props.value : []))

function toggleChoice(option: string, on: boolean) {
  const next = on
    ? [...chosen.value, option]
    : chosen.value.filter((choice) => choice !== option)
  const ordered = (props.field.options ?? []).filter((choice) =>
    next.includes(choice),
  )
  emit('save', ordered.length ? ordered : null)
}

function choose(option: unknown) {
  if (typeof option !== 'string') return
  const next = option === NONE ? null : option
  if (next !== (props.value ?? null)) emit('save', next)
}
</script>

<template>
  <!-- Checkbox -->
  <template v-if="field.type === 'checkbox'">
    <Checkbox
      v-if="editable"
      :model-value="value === true"
      :aria-label="editLabel"
      @update:model-value="emit('save', $event === true)"
    />
    <template v-else-if="value === true">
      <Check class="size-4 text-primary" aria-hidden="true" />
      <span class="sr-only">{{ $t('table.yes') }}</span>
    </template>
  </template>

  <!-- Rating: click a star to rate, click the same star again to clear -->
  <div
    v-else-if="field.type === 'rating'"
    class="flex items-center"
    :role="editable ? 'group' : 'img'"
    :aria-label="
      editable
        ? editLabel
        : value
          ? $t('table.stars', Number(value))
          : $t('table.noRating')
    "
  >
    <component
      :is="editable ? 'button' : 'span'"
      v-for="stars in 5"
      :key="stars"
      :type="editable ? 'button' : undefined"
      :aria-label="editable ? $t('table.rate', stars) : undefined"
      :aria-pressed="editable ? value === stars : undefined"
      :class="
        editable &&
        'rounded-sm p-0.5 outline-none hover:text-highlight focus-visible:ring-2 focus-visible:ring-ring'
      "
      @click="editable && rate(stars)"
    >
      <Star
        class="size-4"
        :class="
          Number(value ?? 0) >= stars
            ? 'fill-highlight text-highlight'
            : 'text-muted-foreground/40'
        "
        aria-hidden="true"
      />
    </component>
  </div>

  <!-- Multiple choice: tags, and a checklist that saves each tick -->
  <template v-else-if="field.type === 'multiselect'">
    <DropdownMenu v-if="editable">
      <DropdownMenuTrigger as-child>
        <button
          type="button"
          class="flex min-h-8 w-full min-w-32 flex-wrap items-center gap-1 rounded-md px-2 py-1 text-left outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          :aria-label="`${editLabel}: ${text || $t('table.empty')}`"
        >
          <Badge v-for="choice in chosen" :key="choice" variant="secondary">
            {{ choice }}
          </Badge>
          <span
            v-if="!chosen.length"
            class="text-muted-foreground/60"
            aria-hidden="true"
            >—</span
          >
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" class="w-max min-w-48">
        <DropdownMenuCheckboxItem
          v-for="option in field.options ?? []"
          :key="option"
          :model-value="chosen.includes(option)"
          @update:model-value="toggleChoice(option, $event === true)"
          @select.prevent
        >
          {{ option }}
        </DropdownMenuCheckboxItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <div v-else class="flex flex-wrap gap-1">
      <Badge v-for="choice in chosen" :key="choice" variant="secondary">
        {{ choice }}
      </Badge>
    </div>
  </template>

  <!-- Select -->
  <template v-else-if="field.type === 'select'">
    <Select
      v-if="editable"
      :model-value="typeof value === 'string' ? value : NONE"
      @update:model-value="choose"
    >
      <SelectTrigger
        size="sm"
        class="h-8 w-full min-w-32 border-transparent bg-transparent shadow-none hover:bg-muted"
        :aria-label="editLabel"
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem :value="NONE">
          <span class="text-muted-foreground">{{ $t('table.none') }}</span>
        </SelectItem>
        <SelectItem
          v-for="option in field.options ?? []"
          :key="option"
          :value="option"
        >
          {{ option }}
        </SelectItem>
      </SelectContent>
    </Select>
    <span v-else>{{ text }}</span>
  </template>

  <!-- Text, number, currency, date and progress -->
  <template v-else>
    <Input
      v-if="editing"
      ref="input"
      v-model="draft"
      :type="inputType"
      :step="field.type === 'currency' ? '0.01' : 'any'"
      :min="
        field.type === 'currency' || field.type === 'progress' ? 0 : undefined
      "
      :max="field.type === 'progress' ? 100 : undefined"
      :aria-label="editLabel"
      class="h-8 min-w-32"
      @keydown.enter.prevent="commit"
      @keydown.escape.prevent="cancel"
      @blur="commit"
    />
    <component
      :is="editable ? 'button' : 'div'"
      v-else
      :type="editable ? 'button' : undefined"
      :aria-label="
        editable ? `${editLabel}: ${text || $t('table.empty')}` : undefined
      "
      class="flex min-h-8 w-full min-w-16 items-center gap-2 rounded-md px-2 text-left"
      :class="[
        editable &&
          'outline-none hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring',
        (field.type === 'number' || field.type === 'currency') &&
          'justify-end tabular-nums',
      ]"
      @click="editable && startEditing()"
    >
      <template v-if="field.type === 'progress' && value !== undefined">
        <span
          class="h-1.5 w-16 overflow-hidden rounded-full bg-muted"
          aria-hidden="true"
        >
          <span
            class="block h-full rounded-full bg-primary"
            :style="{ width: `${value}%` }"
          />
        </span>
        <span class="tabular-nums">{{ text }}</span>
      </template>
      <span
        v-else
        :class="{ 'line-clamp-2': field.type === 'text' }"
        :title="field.type === 'text' ? text : undefined"
        >{{ text }}</span
      >
      <span
        v-if="editable && !text"
        class="text-muted-foreground/60"
        aria-hidden="true"
        >—</span
      >
    </component>
  </template>
</template>
