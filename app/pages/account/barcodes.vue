<script setup lang="ts">
import type {
  BarcodeReviewAction,
  BarcodeReviewGroup,
  BarcodeReviewOutcome,
  BarcodeReviewStatus,
} from '#shared/types/barcode'
import { reviewGroupKey } from '#shared/utils/barcode'

/**
 * The barcode reviewer's view of what people matched to barcodes themselves:
 * grouped by barcode, game and platform, to approve, reject or send to
 * ScanDex. Not found for everyone else.
 */
const auth = useAuth()
if (!auth.me.value?.reviewsBarcodes) {
  throw createError({
    statusCode: 404,
    statusMessage: 'Page not found',
    fatal: true,
  })
}

const { t, locale } = useI18n()
useHead(() => ({
  title: t('app.title', { page: t('account.tabs.barcodes') }),
}))

const review = useBarcodeReview()
const statuses: {
  value: BarcodeReviewStatus
  labelKey: string
  emptyKey: string
}[] = [
  {
    value: 'pending',
    labelKey: 'barcodeReview.status.pending',
    emptyKey: 'barcodeReview.empty.pending',
  },
  {
    value: 'approved',
    labelKey: 'barcodeReview.status.approved',
    emptyKey: 'barcodeReview.empty.approved',
  },
  {
    value: 'rejected',
    labelKey: 'barcodeReview.status.rejected',
    emptyKey: 'barcodeReview.empty.rejected',
  },
]
const status = ref<BarcodeReviewStatus>('pending')
const groups = ref<BarcodeReviewGroup[] | null>(null)
// More picks exist than the list shows.
const truncated = ref(false)
const failed = ref(false)
const ticked = ref(new Set<string>())
const busy = ref(false)
const problem = ref(false)
const progress = ref<{ done: number; total: number } | null>(null)
/** What the last action did to each group, shown on its row. */
const outcomes = ref(
  new Map<
    string,
    { action: BarcodeReviewAction; outcome: BarcodeReviewOutcome }
  >(),
)

let loadId = 0
async function load() {
  const mine = ++loadId
  failed.value = false
  groups.value = null
  truncated.value = false
  ticked.value = new Set()
  outcomes.value = new Map()
  try {
    const found = await review.list(status.value)
    if (mine === loadId) {
      groups.value = found.groups
      truncated.value = found.truncated
    }
  } catch {
    if (mine === loadId) failed.value = true
  }
}

function show(next: BarcodeReviewStatus) {
  if (next === status.value || busy.value) return
  status.value = next
  load()
}

onMounted(load)

const emptyKey = computed(
  () => statuses.find((option) => option.value === status.value)!.emptyKey,
)

const date = computed(
  () => new Intl.DateTimeFormat(locale.value, { dateStyle: 'medium' }),
)

const shown = computed(() => groups.value ?? [])
// Rejected groups are done with, and a sent one has nothing left to do.
const selectable = (group: BarcodeReviewGroup) =>
  group.status === 'pending' || (group.status === 'approved' && !group.sent)
const chosen = computed(() =>
  shown.value.filter(
    (group) => ticked.value.has(group.key) && selectable(group),
  ),
)

function setTicked(key: string, on: boolean) {
  const next = new Set(ticked.value)
  if (on) next.add(key)
  else next.delete(key)
  ticked.value = next
}

function tickAll(on: boolean) {
  ticked.value = on
    ? new Set(shown.value.filter(selectable).map((g) => g.key))
    : new Set()
}

/** A group ScanDex already answers with the same game needs no sending. */
const canSend = (group: BarcodeReviewGroup) =>
  group.platformId !== null &&
  !(typeof group.scandex === 'object' && group.scandex?.igdbId === group.igdbId)

/** Updates the rows on screen to what a round of an action did. */
function apply(action: BarcodeReviewAction, round: BarcodeReviewOutcome[]) {
  const next = new Map(outcomes.value)
  for (const outcome of round) {
    const key = reviewGroupKey(outcome)
    next.set(key, { action, outcome })
    const group = shown.value.find((g) => g.key === key)
    if (!group || outcome.result !== 'done') continue
    if (action === 'reject') group.status = 'rejected'
    else {
      if (action !== 'send') group.status = 'approved'
      if (
        outcome.send?.result === 'sent' ||
        outcome.send?.result === 'already'
      ) {
        group.sent = true
      }
    }
    if (group.status === 'approved') {
      // Other games for the same barcode now conflict with this one.
      for (const other of shown.value) {
        if (
          other.status === 'pending' &&
          other.code === group.code &&
          other.key !== group.key
        ) {
          other.conflict = { name: group.name }
        }
      }
    }
  }
  outcomes.value = next
}

async function run(action: BarcodeReviewAction, targets: BarcodeReviewGroup[]) {
  if (busy.value || !targets.length) return
  busy.value = true
  problem.value = false
  progress.value = { done: 0, total: targets.length }
  try {
    await review.actInRounds(action, targets.map(targetOf), (round, done) => {
      apply(action, round)
      progress.value = { done, total: targets.length }
    })
  } catch {
    problem.value = true
  } finally {
    busy.value = false
  }
  const next = new Set(ticked.value)
  for (const group of targets) next.delete(group.key)
  ticked.value = next
}

function message(key: string): { text: string; bad: boolean } | null {
  const found = outcomes.value.get(key)
  if (!found) return null
  const { action, outcome } = found
  if (outcome.result === 'conflict') {
    return { text: t('barcodeReview.conflicted'), bad: true }
  }
  if (outcome.result === 'gone') {
    return { text: t('barcodeReview.gone'), bad: true }
  }
  if (outcome.send?.result === 'failed') {
    return {
      text: outcome.send.message
        ? t('barcodeReview.failedWith', { message: outcome.send.message })
        : t('barcodeReview.failed'),
      bad: true,
    }
  }
  if (outcome.send?.result === 'already') {
    return { text: t('barcodeReview.alreadyDone'), bad: false }
  }
  const sent = outcome.send?.result === 'sent'
  return {
    text:
      action === 'reject'
        ? t('barcodeReview.rejected')
        : action === 'send'
          ? t('barcodeReview.sent')
          : sent
            ? t('barcodeReview.approvedAndSent')
            : t('barcodeReview.approved'),
    bad: false,
  }
}

const scandexLine = (group: BarcodeReviewGroup) =>
  group.scandex === null
    ? null
    : group.scandex === 'none'
      ? t('barcodeReview.scandexNone')
      : t('barcodeReview.scandexSays', {
          name: group.scandex.name ?? `#${group.scandex.igdbId}`,
        })
</script>

<template>
  <Card data-testid="barcodes-page">
    <CardHeader>
      <CardTitle>
        <h2 class="text-lg font-semibold">
          {{ $t('barcodeReview.title') }}
        </h2>
      </CardTitle>
      <CardDescription>{{ $t('barcodeReview.description') }}</CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-4">
      <div
        class="flex flex-wrap gap-2"
        role="group"
        :aria-label="$t('barcodeReview.filter')"
      >
        <Button
          v-for="option in statuses"
          :key="option.value"
          type="button"
          size="sm"
          :variant="status === option.value ? 'default' : 'outline'"
          :aria-pressed="status === option.value"
          :disabled="busy"
          :data-testid="`filter-${option.value}`"
          @click="show(option.value)"
        >
          {{ $t(option.labelKey) }}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          class="ml-auto"
          :disabled="busy"
          @click="load"
        >
          {{ $t('barcodeReview.refresh') }}
        </Button>
      </div>

      <div v-if="failed" class="flex flex-col items-start gap-2">
        <FormMessage>{{ $t('barcodeReview.loadFailed') }}</FormMessage>
        <Button type="button" variant="outline" size="sm" @click="load">
          {{ $t('barcodeReview.retry') }}
        </Button>
      </div>
      <p v-else-if="!groups" class="text-sm text-muted-foreground">
        {{ $t('barcodeReview.loading') }}
      </p>
      <p
        v-else-if="!groups.length"
        class="text-sm text-muted-foreground"
        data-testid="review-empty"
      >
        {{ $t(emptyKey) }}
      </p>
      <template v-else>
        <p
          v-if="truncated"
          class="text-sm font-medium"
          data-testid="review-truncated"
        >
          {{ $t('barcodeReview.truncated', { count: groups.length }) }}
        </p>
        <div class="flex flex-wrap items-center gap-2">
          <p
            class="mr-auto text-sm text-muted-foreground"
            data-testid="review-count"
          >
            {{
              $t(
                'barcodeReview.count',
                { count: groups.length, chosen: chosen.length },
                groups.length,
              )
            }}
          </p>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            :disabled="busy"
            @click="tickAll(true)"
          >
            {{ $t('barcodeReview.selectAll') }}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            :disabled="busy"
            @click="tickAll(false)"
          >
            {{ $t('barcodeReview.clear') }}
          </Button>
        </div>

        <div
          v-if="status !== 'rejected'"
          class="flex flex-wrap items-center gap-2"
          data-testid="review-bulk"
        >
          <template v-if="status === 'pending'">
            <Button
              type="button"
              size="sm"
              :disabled="busy || !chosen.length"
              data-testid="bulk-approve"
              @click="run('approve', chosen)"
            >
              {{ $t('barcodeReview.bulkApprove', { count: chosen.length }) }}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              :disabled="busy || !chosen.length"
              data-testid="bulk-approve-send"
              @click="run('approveAndSend', chosen)"
            >
              {{
                $t('barcodeReview.bulkApproveSend', { count: chosen.length })
              }}
            </Button>
          </template>
          <Button
            v-else
            type="button"
            size="sm"
            :disabled="busy || !chosen.length"
            data-testid="bulk-send"
            @click="run('send', chosen)"
          >
            {{ $t('barcodeReview.bulkSend', { count: chosen.length }) }}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            :disabled="busy || !chosen.length"
            data-testid="bulk-reject"
            @click="run('reject', chosen)"
          >
            {{ $t('barcodeReview.bulkReject', { count: chosen.length }) }}
          </Button>
        </div>

        <p
          v-if="progress"
          class="text-sm text-muted-foreground"
          role="status"
          data-testid="review-progress"
        >
          {{ $t('barcodeReview.progress', progress) }}
        </p>
        <FormMessage v-if="problem">{{
          $t('barcodeReview.requestFailed')
        }}</FormMessage>

        <ul class="flex flex-col gap-2" :aria-label="$t('barcodeReview.list')">
          <li
            v-for="group in groups"
            :key="group.key"
            data-testid="review-group"
            class="flex items-start gap-3 rounded-lg border p-3"
          >
            <Checkbox
              v-if="selectable(group)"
              class="mt-1"
              :disabled="busy"
              :model-value="ticked.has(group.key)"
              :aria-label="$t('barcodeReview.tick', { name: group.name })"
              @update:model-value="setTicked(group.key, $event === true)"
            />
            <GameCover
              :name="group.name"
              :cover-id="group.coverId"
              size="thumb"
              class="w-12 shrink-0"
            />
            <div class="flex min-w-0 flex-1 flex-col gap-1">
              <p class="truncate font-medium">{{ group.name }}</p>
              <p class="truncate text-xs text-muted-foreground">
                {{ group.platform ?? $t('barcodeReview.noPlatform') }} ·
                {{ group.code }}
              </p>
              <p class="text-xs text-muted-foreground">
                <span data-testid="group-people">{{
                  $t(
                    'barcodeReview.people',
                    { count: group.people },
                    group.people,
                  )
                }}</span>
                <template v-if="group.users.length">
                  · {{ group.users.join(', ') }}
                </template>
                · {{ date.format(new Date(group.pickedAt)) }}
              </p>
              <p
                v-if="scandexLine(group)"
                class="text-xs"
                :class="
                  group.disagrees
                    ? 'font-medium text-destructive'
                    : 'text-muted-foreground'
                "
                data-testid="group-scandex"
              >
                {{ scandexLine(group) }}
                <template v-if="group.disagrees">
                  {{ $t('barcodeReview.disagrees') }}
                </template>
              </p>
              <p
                v-if="group.conflict"
                class="text-xs font-medium text-destructive"
                data-testid="group-conflict"
              >
                {{
                  $t('barcodeReview.conflict', { name: group.conflict.name })
                }}
              </p>
              <p
                v-if="group.status === 'approved' && group.sent"
                class="text-xs text-muted-foreground"
                data-testid="group-sent"
              >
                {{ $t('barcodeReview.alreadySent') }}
              </p>
              <p
                v-if="message(group.key)"
                class="text-xs font-medium"
                :class="message(group.key)!.bad ? 'text-destructive' : ''"
                role="status"
                data-testid="group-result"
              >
                {{ message(group.key)!.text }}
              </p>
              <div class="mt-1 flex flex-wrap gap-2">
                <template v-if="group.status === 'pending'">
                  <Button
                    type="button"
                    size="sm"
                    :disabled="busy || !!group.conflict"
                    @click="run('approve', [group])"
                  >
                    {{ $t('barcodeReview.approve') }}
                  </Button>
                  <Button
                    v-if="canSend(group)"
                    type="button"
                    size="sm"
                    variant="outline"
                    :disabled="busy || !!group.conflict"
                    @click="run('approveAndSend', [group])"
                  >
                    {{ $t('barcodeReview.approveSend') }}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    :disabled="busy"
                    @click="run('reject', [group])"
                  >
                    {{ $t('barcodeReview.reject') }}
                  </Button>
                </template>
                <template
                  v-else-if="group.status === 'approved' && !group.sent"
                >
                  <Button
                    v-if="canSend(group)"
                    type="button"
                    size="sm"
                    :disabled="busy"
                    @click="run('send', [group])"
                  >
                    {{ $t('barcodeReview.send') }}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    :disabled="busy"
                    @click="run('reject', [group])"
                  >
                    {{ $t('barcodeReview.reject') }}
                  </Button>
                </template>
              </div>
            </div>
          </li>
        </ul>
      </template>
    </CardContent>
  </Card>
</template>
