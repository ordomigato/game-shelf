<script setup lang="ts">
import { GripVertical, Plus, Trash2, X } from '@lucide/vue'
import { VueDraggable } from 'vue-draggable-plus'
import type { FieldType, RatingScale } from '#shared/types/collection'
import { MAX_FIELDS, RATING_SCALES } from '#shared/utils/field-changes'
import type { FieldDrafts } from '~/composables/useFieldDrafts'

/**
 * The list of fields being edited: add, rename, reorder, remove, change
 * type, and a choice list's choices, an amount's currency or what a score
 * is out of. The state lives in `useFieldDrafts`, so the field editor
 * dialog and the blueprint page share it.
 */
const props = defineProps<{ editor: FieldDrafts }>()

const { t, locale } = useI18n()

function add() {
  props.editor.addField()
  void nextTick(() => {
    const inputs =
      document.querySelectorAll<HTMLInputElement>('[data-field-name]')
    inputs[inputs.length - 1]?.focus()
  })
}

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
</script>

<template>
  <div class="flex flex-col gap-3">
    <p
      v-if="!editor.drafts.value.length"
      class="rounded-lg border border-dashed py-6 text-center text-muted-foreground"
    >
      {{ $t('fieldEditor.empty') }}
    </p>
    <VueDraggable
      :model-value="editor.drafts.value"
      tag="ol"
      class="flex flex-col gap-3"
      handle=".field-handle"
      ghost-class="drag-gap"
      :animation="150"
      @update:model-value="editor.setOrder"
    >
      <li
        v-for="draft in editor.drafts.value"
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
            :model-value="draft.type === 'multiselect' ? 'select' : draft.type"
            @update:model-value="editor.setType(draft, $event)"
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
            @click="editor.removeField(draft.key)"
          >
            <Trash2 />
          </Button>
        </div>

        <!-- A choice list's options -->
        <div v-if="editor.isChoiceList(draft)" class="flex flex-col gap-2 pl-6">
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
              @keydown.enter.prevent="editor.addOption(draft)"
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
              @click="editor.removeOption(draft, option.key)"
            >
              <X />
            </Button>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            class="self-start"
            @click="editor.addOption(draft)"
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
              <SelectItem v-for="code in CURRENCIES" :key="code" :value="code">
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
            @update:model-value="editor.setScale(draft, $event)"
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
      :disabled="editor.drafts.value.length >= MAX_FIELDS"
      @click="add"
    >
      <Plus /> {{ $t('fieldEditor.add') }}
    </Button>
  </div>
</template>
