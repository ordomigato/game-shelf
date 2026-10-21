<script setup lang="ts">
import type { BarcodeSuggestion, SuggestionResult } from '#shared/types/barcode'

/**
 * A ticked list of the user's own barcode picks to share with ScanDex, with
 * a Send button and, as each round of 20 returns, how each pick went. Used
 * by the scanner's share step and by the ScanDex tab.
 * - `dismissable` adds a Not now button. Both Not now and Done emit `close`.
 * - `list` is the whole-list mode: Select all and Clear, a count, and no
 *   Done step. When a send finishes it emits `sent` if any pick went, so the
 *   owner can reload `items`. Picks that failed stay ticked, with their
 *   reason, and new picks arrive ticked.
 */
const props = defineProps<{
  items: BarcodeSuggestion[]
  dismissable?: boolean
  list?: boolean
}>()
const emit = defineEmits<{ close: []; sent: [] }>()

const { t } = useI18n()
const sharing = useBarcodeSharing()
const ticked = ref(new Set(props.items.map((item) => item.code)))
const sending = ref(false)
const problem = ref(false)
const results = ref<Map<string, SuggestionResult>>(new Map())
const finished = ref(false)
const progress = ref<{ done: number; total: number } | null>(null)
let known = new Set(props.items.map((item) => item.code))

// A reloaded list keeps the ticks it has and ticks the picks it hasn't seen.
watch(
  () => props.items,
  (items) => {
    const next = new Set(ticked.value)
    for (const item of items) if (!known.has(item.code)) next.add(item.code)
    known = new Set(items.map((item) => item.code))
    ticked.value = new Set([...next].filter((code) => known.has(code)))
  },
)

const count = computed(() => ticked.value.size)

function setTicked(code: string, on: boolean) {
  const next = new Set(ticked.value)
  if (on) next.add(code)
  else next.delete(code)
  ticked.value = next
}

function tickAll(on: boolean) {
  ticked.value = on ? new Set(props.items.map((item) => item.code)) : new Set()
}

async function send() {
  if (sending.value || !count.value) return
  sending.value = true
  problem.value = false
  const codes = props.items
    .map((item) => item.code)
    .filter((c) => ticked.value.has(c))
  const answers = new Map<string, SuggestionResult>()
  results.value = answers
  progress.value = { done: 0, total: codes.length }
  try {
    await sharing.sendInRounds(codes, (round, done) => {
      for (const r of round) answers.set(r.code, r)
      results.value = new Map(answers)
      progress.value = { done, total: codes.length }
    })
    finished.value = true
  } catch {
    problem.value = true
  } finally {
    sending.value = false
  }
  if (props.list && [...answers.values()].some((r) => r.result === 'sent')) {
    emit('sent')
  }
}

// In the scanner, once sent, only the picks that were sent are listed.
const shown = computed(() =>
  finished.value && !props.list
    ? props.items.filter((item) => results.value.has(item.code))
    : props.items,
)

const outcome = (code: string) => results.value.get(code)

function failure(code: string): string {
  const found = outcome(code)
  return found?.result === 'failed' && found.message
    ? t('scanShare.failedWith', { message: found.message })
    : t('scanShare.failed')
}
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3" data-testid="share">
    <div v-if="list" class="flex flex-wrap items-center gap-2">
      <p
        class="mr-auto text-sm text-muted-foreground"
        data-testid="share-count"
      >
        {{ $t('scanShare.count', { count: items.length }, items.length) }}
      </p>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        :disabled="sending"
        @click="tickAll(true)"
      >
        {{ $t('scanShare.selectAll') }}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        :disabled="sending"
        @click="tickAll(false)"
      >
        {{ $t('scanShare.clear') }}
      </Button>
    </div>

    <ul
      class="-mx-2 flex min-h-24 flex-1 flex-col gap-1 overflow-y-auto px-2"
      :aria-label="$t('scanShare.listLabel')"
    >
      <li
        v-for="item in shown"
        :key="item.code"
        data-testid="share-row"
        class="flex items-center gap-3 rounded-lg border p-2"
      >
        <Checkbox
          v-if="list || !finished"
          :disabled="sending"
          :model-value="ticked.has(item.code)"
          :aria-label="$t('scanShare.tick', { name: item.name })"
          @update:model-value="setTicked(item.code, $event === true)"
        />
        <GameCover
          :name="item.name"
          :cover-id="item.coverId"
          size="thumb"
          class="w-10 shrink-0"
        />
        <div class="min-w-0 flex-1">
          <p class="truncate font-medium">{{ item.name }}</p>
          <p class="truncate text-xs text-muted-foreground">
            {{ item.platform }} · {{ item.code }}
          </p>
          <p
            v-if="outcome(item.code)?.result === 'sent'"
            class="text-xs font-medium"
            data-testid="share-sent"
          >
            {{ $t('scanShare.sent') }}
          </p>
          <p
            v-else-if="outcome(item.code)"
            class="text-xs font-medium text-destructive"
            data-testid="share-failed"
          >
            {{ failure(item.code) }}
          </p>
        </div>
      </li>
    </ul>

    <p
      v-if="progress"
      class="text-sm text-muted-foreground"
      role="status"
      data-testid="share-progress"
    >
      {{ $t('scanShare.progress', progress) }}
    </p>

    <FormMessage v-if="problem">{{
      $t('scanShare.requestFailed')
    }}</FormMessage>

    <div class="flex items-center justify-end gap-2">
      <template v-if="finished && !list">
        <Button type="button" data-testid="share-done" @click="emit('close')">
          {{ $t('scanShare.done') }}
        </Button>
      </template>
      <template v-else>
        <Button
          v-if="dismissable"
          type="button"
          variant="ghost"
          :disabled="sending"
          @click="emit('close')"
        >
          {{ $t('scanShare.notNow') }}
        </Button>
        <Button
          type="button"
          :disabled="!count || sending"
          data-testid="share-send"
          @click="send"
        >
          {{
            sending
              ? $t('scanShare.sending')
              : $t('scanShare.send', { count }, count)
          }}
        </Button>
      </template>
    </div>
  </div>
</template>
