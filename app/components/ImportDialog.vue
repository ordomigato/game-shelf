<script setup lang="ts">
import { FileUp } from '@lucide/vue'
import type { Blueprint, FieldType } from '#shared/types/collection'
import {
  autoMap,
  IMPORT_CHUNK_SIZE,
  MAX_IMPORT_ROWS,
  planImport,
  type ColumnTarget,
  type ImportProblem,
} from '#shared/utils/csv-import'

/**
 * Imports a CSV file into a collection, in four steps: choose the file
 * (read here in the browser), match its columns to fields (or new fields),
 * review what will happen and what won't fit, then import in chunks with
 * progress. Nothing is saved before the last step.
 */
const props = defineProps<{
  collectionId: string
  blueprint: Pick<Blueprint, 'fields' | 'shared' | 'name' | 'usedBy'>
}>()
const emit = defineEmits<{ imported: [] }>()
const open = defineModel<boolean>('open', { default: false })

const { t } = useI18n()
const auth = useAuth()

type Step = 'file' | 'map' | 'review' | 'importing' | 'done'
const step = ref<Step>('file')
const fileName = ref('')
const fileError = ref('')
const headers = ref<string[]>([])
const rows = ref<string[][]>([])
const tooMany = ref(false)
const targets = ref<ColumnTarget[]>([])
const progress = ref(0)
const importError = ref('')
const result = ref({ added: 0, updated: 0, linked: 0, handAdded: 0 })

const MAX_FILE_BYTES = 5 * 1024 * 1024

watch(open, (isOpen) => {
  if (!isOpen) return
  step.value = 'file'
  fileName.value = ''
  fileError.value = ''
  importError.value = ''
  progress.value = 0
})

async function readFile(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  fileError.value = ''
  if (file.size > MAX_FILE_BYTES) {
    fileError.value = t('import.tooBig')
    return
  }
  try {
    // Only loaded when someone imports.
    const { default: Papa } = await import('papaparse')
    const parsed = Papa.parse<string[]>(await file.text(), {
      skipEmptyLines: 'greedy',
    })
    const [header, ...body] = parsed.data
    if (!header?.length || !body.length) {
      fileError.value = t('import.empty')
      return
    }
    fileName.value = file.name
    headers.value = header.map((cell) => cell.replace(/^\uFEFF/, '').trim())
    tooMany.value = body.length > MAX_IMPORT_ROWS
    rows.value = body.slice(0, MAX_IMPORT_ROWS)
    targets.value = autoMap(headers.value, rows.value, props.blueprint.fields)
    step.value = 'map'
  } catch {
    fileError.value = t('import.unreadable')
  }
}

// Column targets as select values: name, igdbId, skip, field:<id>, new.
function targetValue(target: ColumnTarget): string {
  return target.kind === 'field' ? `field:${target.fieldId}` : target.kind
}

function setTarget(index: number, value: unknown) {
  if (typeof value !== 'string') return
  const header = headers.value[index] ?? ''
  const next: ColumnTarget =
    value === 'name' || value === 'igdbId' || value === 'skip'
      ? { kind: value }
      : value.startsWith('field:')
        ? { kind: 'field', fieldId: value.slice(6) }
        : {
            kind: 'new',
            name: header.slice(0, 60) || t('import.newField'),
            type: 'text',
          }
  // One column holds the name, and one the IGDB id.
  targets.value = targets.value.map((target, i) =>
    i === index
      ? next
      : (next.kind === 'name' || next.kind === 'igdbId') &&
          target.kind === next.kind
        ? { kind: 'skip' }
        : target,
  )
}

function setNewType(index: number, type: unknown) {
  const target = targets.value[index]
  if (target?.kind !== 'new' || typeof type !== 'string') return
  targets.value = targets.value.map((entry, i) =>
    i === index ? { ...target, type: type as FieldType } : entry,
  )
}

const hasName = computed(() =>
  targets.value.some((target) => target.kind === 'name'),
)

const samples = (index: number) =>
  rows.value
    .map((row) => row[index]?.trim())
    .filter(Boolean)
    .slice(0, 2)
    .join(', ')

const types: { type: FieldType; labelKey: string }[] = [
  { type: 'text', labelKey: 'fieldEditor.types.text' },
  { type: 'number', labelKey: 'fieldEditor.types.number' },
  { type: 'currency', labelKey: 'fieldEditor.types.currency' },
  { type: 'date', labelKey: 'fieldEditor.types.date' },
  { type: 'checkbox', labelKey: 'fieldEditor.types.checkbox' },
  { type: 'select', labelKey: 'fieldEditor.types.select' },
  { type: 'multiselect', labelKey: 'import.multipleChoice' },
  { type: 'rating', labelKey: 'fieldEditor.types.rating' },
  { type: 'progress', labelKey: 'fieldEditor.types.progress' },
]

const plan = computed(() =>
  step.value === 'map' || step.value === 'review'
    ? planImport(
        headers.value,
        rows.value,
        targets.value,
        props.blueprint.fields,
      )
    : null,
)
const linkedCount = computed(
  () => plan.value?.rows.filter((row) => row.igdbId !== null).length ?? 0,
)
const fieldName = (id: string) =>
  plan.value?.fields.find((field) => field.id === id)?.name ?? ''

const reasons: Record<ImportProblem['reason'], { key: string }> = {
  noName: { key: 'import.problems.noName' },
  badIgdbId: { key: 'import.problems.badIgdbId' },
  doesNotFit: { key: 'import.problems.doesNotFit' },
}

async function runImport() {
  const current = plan.value
  if (!current) return
  step.value = 'importing'
  progress.value = 0
  importError.value = ''
  const totals = { added: 0, updated: 0, linked: 0, handAdded: 0 }
  const fieldsChanged =
    current.newFields.length > 0 || Object.keys(current.addedOptions).length > 0
  try {
    for (
      let start = 0;
      start < current.rows.length;
      start += IMPORT_CHUNK_SIZE
    ) {
      const chunk = await auth.apiFetch<typeof totals>(
        `/api/collections/${props.collectionId}/import`,
        {
          method: 'POST',
          body: {
            ...(start === 0 && fieldsChanged && { fields: current.fields }),
            rows: current.rows.slice(start, start + IMPORT_CHUNK_SIZE),
          },
        },
      )
      totals.added += chunk.added
      totals.updated += chunk.updated
      totals.linked += chunk.linked
      totals.handAdded += chunk.handAdded
      progress.value = Math.min(start + IMPORT_CHUNK_SIZE, current.rows.length)
    }
    result.value = totals
    step.value = 'done'
    emit('imported')
  } catch {
    // Chunks already sent are kept. Importing the file again updates them.
    importError.value = t('import.failed', { done: progress.value })
    result.value = totals
    step.value = 'done'
    emit('imported')
  }
}
</script>

<template>
  <Dialog v-model:open="open">
    <DialogContent class="max-h-[90vh] overflow-y-auto sm:max-w-3xl">
      <DialogHeader>
        <DialogTitle>{{ $t('import.title') }}</DialogTitle>
        <DialogDescription>{{ $t('import.description') }}</DialogDescription>
      </DialogHeader>

      <!-- 1. Choose a file -->
      <div v-if="step === 'file'" class="flex flex-col gap-3">
        <label
          class="flex cursor-pointer flex-col items-center gap-2 rounded-lg border border-dashed p-8 text-center hover:bg-muted focus-within:ring-2 focus-within:ring-ring"
        >
          <FileUp class="size-8 text-muted-foreground" aria-hidden="true" />
          <span class="font-medium">{{ $t('import.choose') }}</span>
          <span class="text-sm text-muted-foreground">{{
            $t('import.chooseHint')
          }}</span>
          <input
            type="file"
            accept=".csv,text/csv"
            class="sr-only"
            :aria-label="$t('import.choose')"
            @change="readFile"
          />
        </label>
        <FormMessage v-if="fileError">{{ fileError }}</FormMessage>
      </div>

      <!-- 2. Match columns -->
      <div v-else-if="step === 'map'" class="flex flex-col gap-3">
        <p class="text-sm text-muted-foreground">
          {{ $t('import.mapHint', { file: fileName, count: rows.length }) }}
        </p>
        <p
          v-if="blueprint.shared"
          class="rounded-md border border-primary/40 bg-accent px-3 py-2 text-sm"
        >
          {{
            $t(
              'import.sharedBlueprint',
              { name: blueprint.name ?? '', count: blueprint.usedBy ?? 1 },
              blueprint.usedBy ?? 1,
            )
          }}
        </p>
        <p v-if="tooMany" class="text-sm text-muted-foreground">
          {{ $t('import.tooMany', { max: MAX_IMPORT_ROWS }) }}
        </p>
        <ul class="flex flex-col divide-y rounded-lg border">
          <li
            v-for="(header, index) in headers"
            :key="index"
            class="flex flex-wrap items-center gap-3 p-3"
          >
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">
                {{ header || $t('import.untitled') }}
              </p>
              <p class="truncate text-xs text-muted-foreground">
                {{ samples(index) }}
              </p>
            </div>
            <Select
              :model-value="targetValue(targets[index]!)"
              @update:model-value="setTarget(index, $event)"
            >
              <SelectTrigger
                class="w-52"
                :aria-label="$t('import.columnTarget', { column: header })"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="name">{{
                  $t('import.targets.name')
                }}</SelectItem>
                <SelectItem value="igdbId">{{
                  $t('import.targets.igdbId')
                }}</SelectItem>
                <SelectItem
                  v-for="field in blueprint.fields"
                  :key="field.id"
                  :value="`field:${field.id}`"
                >
                  {{ field.name }}
                </SelectItem>
                <SelectItem value="new">{{
                  $t('import.targets.new')
                }}</SelectItem>
                <SelectItem value="skip">{{
                  $t('import.targets.skip')
                }}</SelectItem>
              </SelectContent>
            </Select>
            <Select
              v-if="targets[index]?.kind === 'new'"
              :model-value="(targets[index] as { type: string }).type"
              @update:model-value="setNewType(index, $event)"
            >
              <SelectTrigger
                class="w-40"
                :aria-label="$t('import.newFieldType', { column: header })"
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
          </li>
        </ul>
        <FormMessage v-if="!hasName">{{ $t('import.needsName') }}</FormMessage>
      </div>

      <!-- 3. Review -->
      <div v-else-if="step === 'review' && plan" class="flex flex-col gap-4">
        <p class="font-medium">
          {{
            $t('import.summary', { count: plan.rows.length }, plan.rows.length)
          }}
        </p>
        <ul class="list-disc pl-5 text-sm text-muted-foreground">
          <li>
            {{ $t('import.linked', { count: linkedCount }, linkedCount) }}
          </li>
          <li>
            {{
              $t(
                'import.byHand',
                { count: plan.rows.length - linkedCount },
                plan.rows.length - linkedCount,
              )
            }}
          </li>
          <li v-if="plan.newFields.length">
            {{
              $t('import.newFields', {
                fields: plan.newFields.map((field) => field.name).join(', '),
              })
            }}
          </li>
          <li v-for="(options, fieldId) in plan.addedOptions" :key="fieldId">
            {{
              $t('import.newChoices', {
                field: fieldName(fieldId),
                choices: options.join(', '),
              })
            }}
          </li>
        </ul>
        <p class="text-sm text-muted-foreground">
          {{ $t('import.updateNote') }}
        </p>

        <div v-if="plan.problems.length" class="flex flex-col gap-2">
          <p class="text-sm font-medium">
            {{
              $t(
                'import.problemsTitle',
                { count: plan.problems.length },
                plan.problems.length,
              )
            }}
          </p>
          <div class="max-h-56 overflow-y-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow class="hover:bg-transparent">
                  <TableHead>{{ $t('import.row') }}</TableHead>
                  <TableHead>{{ $t('import.column') }}</TableHead>
                  <TableHead>{{ $t('import.value') }}</TableHead>
                  <TableHead>{{ $t('import.why') }}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow
                  v-for="(problem, index) in plan.problems.slice(0, 100)"
                  :key="index"
                >
                  <TableCell class="tabular-nums">{{ problem.row }}</TableCell>
                  <TableCell>{{ problem.column }}</TableCell>
                  <TableCell class="max-w-40 truncate">{{
                    problem.value
                  }}</TableCell>
                  <TableCell>{{ $t(reasons[problem.reason].key) }}</TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </div>

      <!-- 4. Importing -->
      <div v-else-if="step === 'importing'" class="flex flex-col gap-2">
        <p>
          {{
            $t('import.progress', {
              done: progress,
              total: plan?.rows.length ?? 0,
            })
          }}
        </p>
        <div
          class="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          :aria-valuenow="progress"
          aria-valuemin="0"
          :aria-valuemax="plan?.rows.length ?? 0"
        >
          <div
            class="h-full bg-primary transition-all"
            :style="{
              width: `${(progress / Math.max(plan?.rows.length ?? 1, 1)) * 100}%`,
            }"
          />
        </div>
      </div>

      <!-- Done -->
      <div v-else-if="step === 'done'" class="flex flex-col gap-2">
        <FormMessage v-if="importError">{{ importError }}</FormMessage>
        <p class="font-medium">{{ $t('import.doneTitle') }}</p>
        <ul class="list-disc pl-5 text-sm text-muted-foreground">
          <li>
            {{ $t('import.added', { count: result.added }, result.added) }}
          </li>
          <li v-if="result.updated">
            {{
              $t('import.updated', { count: result.updated }, result.updated)
            }}
          </li>
        </ul>
      </div>

      <DialogFooter>
        <template v-if="step === 'map'">
          <Button variant="outline" @click="step = 'file'">
            {{ $t('import.back') }}
          </Button>
          <Button :disabled="!hasName" @click="step = 'review'">
            {{ $t('import.next') }}
          </Button>
        </template>
        <template v-else-if="step === 'review' && plan">
          <Button variant="outline" @click="step = 'map'">
            {{ $t('import.back') }}
          </Button>
          <Button :disabled="!plan.rows.length" @click="runImport">
            {{
              $t('import.start', { count: plan.rows.length }, plan.rows.length)
            }}
          </Button>
        </template>
        <Button v-else-if="step === 'done'" @click="open = false">
          {{ $t('import.close') }}
        </Button>
        <Button
          v-else-if="step === 'file'"
          variant="outline"
          @click="open = false"
        >
          {{ $t('import.cancel') }}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>
</template>
