<script setup lang="ts">
import { Trash2 } from '@lucide/vue'
import { toast } from 'vue-sonner'
import type { BulkAddResult } from '#shared/types/barcode'
import type { ListName } from '#shared/types/collection'
import { MAX_SCAN_BATCH } from '#shared/utils/barcode'
import { canTick, rowHold, type ScanRow } from '~/utils/scan-rows'

/**
 * Scan the barcodes on a stack of boxes, check the list, and add the ticked
 * games to Owned or the Wishlist in one request. Mounted once in the layout
 * and opened from any page (see `useBarcodeScanner`).
 */
const { t } = useI18n()
const scanner = useBarcodeScanner()
const {
  open,
  rows,
  list,
  collection,
  intoCollection,
  highlighted,
  toAdd,
  isFull,
} = scanner

const cameraProblem = ref<'denied' | 'none' | null>(null)
const typed = ref('')
const typedProblem = ref<'invalid' | 'full' | null>(null)
const adding = ref(false)
const confirmingClose = ref(false)

const listName = computed(() => t(`shelf.${list.value}`))

function submitTyped() {
  const outcome = scanner.scan(typed.value)
  typedProblem.value =
    outcome === 'invalid' ? 'invalid' : outcome === 'full' ? 'full' : null
  if (outcome === 'added' || outcome === 'duplicate') typed.value = ''
}

function onCameraScan(value: string, format: string) {
  const outcome = scanner.scan(value, format)
  // Misreads fail the check digit and are ignored.
  typedProblem.value = outcome === 'full' ? 'full' : null
}

function onOpenChange(next: boolean) {
  if (next) return
  if (rows.value.length) confirmingClose.value = true
  else open.value = false
}

function closeKeeping() {
  confirmingClose.value = false
  open.value = false
}

function closeClearing() {
  scanner.clear()
  closeKeeping()
}

// With a mouse and keyboard the field takes focus, ready for a USB scanner.
// On a phone it stays put so the keyboard doesn't cover the camera.
function focusField(event: Event) {
  if (!matchMedia('(pointer: fine)').matches) return
  event.preventDefault()
  document.getElementById('scan-typed')?.focus()
}

function chooseList(value: unknown) {
  if (value === 'owned' || value === 'wishlist') scanner.setList(value)
}

watch(open, (isOpen) => {
  if (isOpen) {
    cameraProblem.value = null
    typedProblem.value = null
  }
})

watch(highlighted, async (code) => {
  if (!code) return
  await nextTick()
  document
    .querySelector(`[data-code="${code}"]`)
    ?.scrollIntoView({ block: 'nearest' })
})

function hold(row: ScanRow) {
  return row.match ? rowHold(row.match, list.value) : 'ready'
}

function year(row: ScanRow) {
  return row.match?.releaseDate?.slice(0, 4) ?? null
}

async function add() {
  if (adding.value || !toAdd.value.length) return
  adding.value = true
  const target: ListName = list.value
  const joined =
    collection.value && intoCollection.value ? collection.value : null
  let result: BulkAddResult
  try {
    result = await scanner.addTicked()
  } catch (error) {
    toast.error(
      limitMessage(error, t) ??
        (isNotFound(error) ? t('scan.gone') : t('scan.addFailed')),
    )
    return
  } finally {
    adding.value = false
  }
  open.value = false
  const already = result.skipped.filter((s) => s.reason === 'already').length
  const other = result.skipped.length - already
  const parts = [
    t('scan.added', { count: result.added, list: t(`shelf.${target}`) }),
    joined && result.inCollection
      ? t('scan.addedToCollection', {
          count: result.inCollection,
          collection: joined.title,
        })
      : null,
    result.withoutPlatform
      ? t(
          'scan.withoutPlatform',
          { count: result.withoutPlatform },
          result.withoutPlatform,
        )
      : null,
    already ? t('scan.skippedAlready', { count: already }, already) : null,
    other ? t('scan.skippedOther', { count: other }, other) : null,
  ]
  toast.success(parts.filter(Boolean).join(' '))
}
</script>

<template>
  <Dialog :open="open" @update:open="onOpenChange">
    <DialogContent
      class="flex max-h-dvh flex-col gap-4 max-sm:top-0 max-sm:left-0 max-sm:h-dvh max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none sm:max-h-[90dvh] sm:max-w-lg"
      data-testid="scanner"
      @open-auto-focus="focusField"
    >
      <DialogHeader>
        <DialogTitle>{{ $t('scan.title') }}</DialogTitle>
        <DialogDescription>{{ $t('scan.description') }}</DialogDescription>
      </DialogHeader>

      <BarcodeCamera
        v-if="!cameraProblem"
        :paused="confirmingClose"
        @scan="onCameraScan"
        @unavailable="cameraProblem = $event"
      />
      <p
        v-else
        class="rounded-lg bg-muted p-3 text-sm text-muted-foreground"
        data-testid="camera-problem"
      >
        {{
          cameraProblem === 'denied'
            ? $t('scan.cameraDenied')
            : $t('scan.cameraNone')
        }}
      </p>

      <form class="flex flex-col gap-1.5" @submit.prevent="submitTyped">
        <Label for="scan-typed">{{ $t('scan.typeLabel') }}</Label>
        <div class="flex gap-2">
          <Input
            id="scan-typed"
            v-model="typed"
            inputmode="numeric"
            autocomplete="off"
            :placeholder="$t('scan.typePlaceholder')"
            :aria-invalid="typedProblem !== null"
          />
          <Button type="submit" variant="outline" :disabled="!typed.trim()">
            {{ $t('scan.typeAdd') }}
          </Button>
        </div>
        <p
          v-if="typedProblem"
          class="text-sm text-destructive"
          role="alert"
          data-testid="scan-problem"
        >
          {{
            typedProblem === 'invalid'
              ? $t('scan.notABarcode')
              : $t('scan.listFull', { max: MAX_SCAN_BATCH })
          }}
        </p>
      </form>

      <p
        v-if="isFull && typedProblem !== 'full'"
        class="text-sm text-muted-foreground"
        data-testid="scan-full"
      >
        {{ $t('scan.listFull', { max: MAX_SCAN_BATCH }) }}
      </p>

      <ul
        v-if="rows.length"
        class="-mx-2 flex min-h-24 flex-1 flex-col gap-1 overflow-y-auto px-2"
        :aria-label="$t('scan.listTitle')"
      >
        <li
          v-for="row in rows"
          :key="row.code"
          :data-code="row.code"
          data-testid="scan-row"
          class="flex items-center gap-3 rounded-lg border p-2 transition-colors"
          :class="{ 'bg-accent': highlighted === row.code }"
        >
          <Checkbox
            v-if="row.status === 'match'"
            :model-value="row.ticked && canTick(row, list)"
            :disabled="!canTick(row, list)"
            :aria-label="$t('scan.tick', { name: row.match?.name ?? '' })"
            @update:model-value="scanner.setTicked(row.code, $event === true)"
          />
          <span v-else class="size-4 shrink-0" aria-hidden="true" />

          <template v-if="row.status === 'match' && row.match">
            <GameCover
              :name="row.match.name"
              :cover-id="row.match.coverId"
              size="thumb"
              class="w-10 shrink-0"
            />
            <div class="min-w-0 flex-1">
              <p class="truncate font-medium">{{ row.match.name }}</p>
              <p class="truncate text-xs text-muted-foreground">
                {{
                  [row.match.platform?.name, year(row)]
                    .filter(Boolean)
                    .join(' · ')
                }}
              </p>
              <p
                v-if="hold(row) !== 'ready'"
                class="text-xs font-medium text-muted-foreground"
              >
                {{
                  hold(row) === 'ownedHere'
                    ? $t('scan.alreadyOwned')
                    : $t('scan.alreadyWishlisted')
                }}
              </p>
            </div>
          </template>
          <p
            v-else-if="row.status === 'loading'"
            class="min-w-0 flex-1 truncate text-sm text-muted-foreground"
          >
            {{ $t('scan.lookingUp', { code: row.code }) }}
          </p>
          <p
            v-else-if="row.status === 'none'"
            class="min-w-0 flex-1 truncate text-sm"
          >
            {{ $t('scan.noMatch', { code: row.code }) }}
          </p>
          <div v-else class="min-w-0 flex-1 text-sm">
            <p>
              {{
                row.problem === 'limit'
                  ? $t('scan.dailyLimit')
                  : $t('scan.failed')
              }}
            </p>
            <Button
              v-if="row.problem !== 'limit'"
              type="button"
              variant="link"
              size="sm"
              class="h-auto p-0"
              @click="scanner.retry(row.code)"
            >
              {{ $t('scan.retry') }}
            </Button>
          </div>

          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            :aria-label="
              row.match
                ? $t('scan.remove', { name: row.match.name })
                : $t('scan.removeCode', { code: row.code })
            "
            @click="scanner.remove(row.code)"
          >
            <Trash2 />
          </Button>
        </li>
      </ul>
      <p v-else class="text-sm text-muted-foreground">
        {{ $t('scan.empty') }}
      </p>

      <DialogFooter class="flex-col gap-3 sm:flex-col sm:items-stretch">
        <div class="flex flex-wrap items-center gap-3">
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            :model-value="list"
            :aria-label="$t('scan.listChoice')"
            @update:model-value="chooseList"
          >
            <ToggleGroupItem value="owned">{{
              $t('shelf.owned')
            }}</ToggleGroupItem>
            <ToggleGroupItem value="wishlist">{{
              $t('shelf.wishlist')
            }}</ToggleGroupItem>
          </ToggleGroup>
          <div v-if="collection" class="flex items-center gap-2">
            <Checkbox id="scan-collection" v-model="intoCollection" />
            <Label for="scan-collection">{{
              $t('scan.toCollection', { collection: collection.title })
            }}</Label>
          </div>
        </div>
        <div class="flex items-center justify-between gap-2">
          <Button
            type="button"
            variant="ghost"
            :disabled="!rows.length || adding"
            @click="scanner.clear()"
          >
            {{ $t('scan.clear') }}
          </Button>
          <Button
            type="button"
            :disabled="!toAdd.length || adding"
            data-testid="scan-add"
            @click="add"
          >
            {{
              adding
                ? $t('scan.adding')
                : $t('scan.add', { count: toAdd.length, list: listName })
            }}
          </Button>
        </div>
      </DialogFooter>
    </DialogContent>
  </Dialog>

  <AlertDialog v-model:open="confirmingClose">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ $t('scan.closeTitle') }}</AlertDialogTitle>
        <AlertDialogDescription>{{
          $t('scan.closeBody', { count: rows.length })
        }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ $t('scan.keepScanning') }}</AlertDialogCancel>
        <Button variant="outline" @click="closeClearing">
          {{ $t('scan.clear') }}
        </Button>
        <Button @click="closeKeeping">{{ $t('scan.closeKeep') }}</Button>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
