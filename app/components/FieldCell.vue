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
// Number inputs hand back numbers, text inputs strings.
const draft = ref<string | number>('')
const input = useTemplateRef<{ $el: HTMLInputElement }>('input')
const hintId = useId()

/** A score out of 5 shows stars. Out of 10 or 100, it edits like a number. */
const isStars = computed(
  () => props.field.type === 'rating' && (props.field.scale ?? 5) === 5,
)

const inputType = computed(() => {
  switch (props.field.type) {
    case 'number':
    case 'currency':
    case 'progress':
    case 'rating':
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

/**
 * The draft as it would be stored (rounded where the field rounds), null to
 * clear, or undefined when it doesn't fit the field.
 */
const parsed = computed((): FieldValue | null | undefined => {
  const raw = String(draft.value).trim()
  if (raw === '') return null
  if (inputType.value !== 'number') return normalizeFieldValue(props.field, raw)
  const number = Number(raw)
  return Number.isFinite(number)
    ? normalizeFieldValue(props.field, number)
    : undefined
})

/** What the box takes, shown when the draft doesn't fit. */
const hint = computed(() => {
  if (parsed.value !== undefined) return ''
  switch (props.field.type) {
    case 'rating':
      return t('table.hints.score', { max: props.field.scale ?? 5 })
    case 'progress':
      return t('table.hints.percentage')
    case 'currency':
      return t('table.hints.amount')
    case 'number':
      return t('table.hints.number')
    default:
      return t('table.hints.text')
  }
})

/** Shown after the box, so it's clear what a number means. */
const suffix = computed(() => {
  if (props.field.type === 'progress') return '%'
  if (props.field.type === 'rating') return `/ ${props.field.scale ?? 5}`
  return ''
})

/** Saves on Enter. A value that doesn't fit stays open with its hint. */
function commit() {
  if (!editing.value || parsed.value === undefined) return
  finish(parsed.value)
}

/** Leaving the box saves a value that fits and puts back one that doesn't. */
function onBlur() {
  if (!editing.value) return
  if (parsed.value === undefined) cancel()
  else finish(parsed.value)
}

function finish(next: FieldValue | null) {
  editing.value = false
  if (next !== (props.value ?? null)) emit('save', next)
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
    v-else-if="isStars"
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
    <template v-if="editing">
      <!--
        The hint floats outside the table, which would otherwise clip it on
        the last row. Screen readers get the hidden copy below instead.
      -->
      <Tooltip :open="Boolean(hint)">
        <TooltipTrigger as-child>
          <div class="flex items-center gap-1.5">
            <Input
              ref="input"
              v-model="draft"
              :type="inputType"
              :step="
                field.type === 'currency'
                  ? '0.01'
                  : field.type === 'rating'
                    ? '1'
                    : 'any'
              "
              :min="
                ['currency', 'progress', 'rating'].includes(field.type)
                  ? 0
                  : undefined
              "
              :max="
                field.type === 'progress'
                  ? 100
                  : field.type === 'rating'
                    ? (field.scale ?? 5)
                    : undefined
              "
              :aria-label="editLabel"
              :aria-invalid="Boolean(hint)"
              :aria-describedby="hint ? hintId : undefined"
              class="h-8 min-w-24"
              @keydown.enter.prevent="commit"
              @keydown.escape.prevent="cancel"
              @blur="onBlur"
            />
            <span
              v-if="suffix"
              class="shrink-0 text-muted-foreground tabular-nums"
              aria-hidden="true"
              >{{ suffix }}</span
            >
          </div>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="start" aria-hidden="true">{{
          hint
        }}</TooltipContent>
      </Tooltip>
      <span :id="hintId" class="sr-only">{{ hint }}</span>
    </template>
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
        ['number', 'currency', 'rating'].includes(field.type) &&
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
