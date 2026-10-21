<script setup lang="ts">
import type { BarcodeSuggestion, SuggestionResult } from '#shared/types/barcode'

/**
 * A ticked list of the user's own barcode picks to share with ScanDex, with
 * a Send button and, once sent, how each one went. Used by the scanner's
 * share step and by Settings. `dismissable` adds a Not now button. Both
 * Not now and Done emit `close`.
 */
const props = defineProps<{
  items: BarcodeSuggestion[]
  dismissable?: boolean
}>()
const emit = defineEmits<{ close: [] }>()

const { t } = useI18n()
const sharing = useBarcodeSharing()
const ticked = ref(new Set(props.items.map((item) => item.code)))
const sending = ref(false)
const problem = ref(false)
const results = ref<Map<string, SuggestionResult> | null>(null)

const count = computed(() => ticked.value.size)

function setTicked(code: string, on: boolean) {
  const next = new Set(ticked.value)
  if (on) next.add(code)
  else next.delete(code)
  ticked.value = next
}

async function send() {
  if (sending.value || !count.value) return
  sending.value = true
  problem.value = false
  try {
    const answer = await sharing.send(
      props.items.map((item) => item.code).filter((c) => ticked.value.has(c)),
    )
    results.value = new Map(answer.map((r) => [r.code, r]))
  } catch {
    problem.value = true
  } finally {
    sending.value = false
  }
}

// Once sent, only the picks that were sent are listed.
const shown = computed(() =>
  results.value
    ? props.items.filter((item) => results.value!.has(item.code))
    : props.items,
)

const outcome = (code: string) => results.value?.get(code)

function failure(code: string): string {
  const found = outcome(code)
  return found?.result === 'failed' && found.message
    ? t('scanShare.failedWith', { message: found.message })
    : t('scanShare.failed')
}
</script>

<template>
  <div class="flex min-h-0 flex-col gap-3" data-testid="share">
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
          v-if="!results"
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

    <FormMessage v-if="problem">{{
      $t('scanShare.requestFailed')
    }}</FormMessage>

    <div class="flex items-center justify-end gap-2">
      <template v-if="results">
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
