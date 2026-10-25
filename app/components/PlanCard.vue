<script setup lang="ts">
import type { PlanUsage } from '#shared/types/user'
import { PLAN_LIMITS } from '#shared/utils/plans'

/** The account's plan and how much of it is used, in Settings. */
const auth = useAuth()
const { plan, limits } = usePlan()
const { t, locale } = useI18n()

const { data: usage, status } = useAsyncData(
  'plan-usage',
  () => auth.apiFetch<PlanUsage>('/api/me/usage'),
  { server: false },
)

const number = (value: number) =>
  new Intl.NumberFormat(locale.value).format(value)

const meters = computed(() =>
  usage.value
    ? [
        {
          labelKey: 'limits.collections',
          used: usage.value.collections,
          limit: limits.value.collections,
        },
        {
          labelKey: 'limits.games',
          used: usage.value.games,
          limit: limits.value.games,
          // One meter for the whole library, with how it splits.
          text: t('limits.gamesMeter', {
            total: number(usage.value.games),
            limit: number(limits.value.games),
            owned: number(usage.value.owned),
            wishlisted: number(usage.value.wishlist),
          }),
        },
        {
          labelKey: 'limits.fields',
          used: usage.value.fields,
          limit: limits.value.fields,
        },
      ]
    : [],
)

const overFields = computed(() => {
  const meter = meters.value.find((m) => m.labelKey === 'limits.fields')
  return meter && meter.used > meter.limit ? meter : null
})

const overOf = (labelKey: string) => {
  const meter = meters.value.find((m) => m.labelKey === labelKey)
  return meter && meter.used > meter.limit ? meter : null
}
const overGames = computed(() => overOf('limits.games'))
const pro = PLAN_LIMITS.pro
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>
        <h2 class="text-lg font-semibold">
          {{ plan === 'pro' ? $t('limits.planPro') : $t('limits.planFree') }}
        </h2>
      </CardTitle>
      <CardDescription>{{ $t('limits.planDescription') }}</CardDescription>
    </CardHeader>
    <CardContent class="flex flex-col gap-5">
      <div v-if="status === 'pending'" class="flex flex-col gap-3">
        <Skeleton class="h-10" />
        <Skeleton class="h-10" />
      </div>
      <div
        v-for="meter in meters"
        :key="meter.labelKey"
        class="flex flex-col gap-1.5"
      >
        <div class="flex justify-between text-sm">
          <span
            class="font-medium"
            :class="{
              'text-destructive': meter.text && meter.used > meter.limit,
            }"
            >{{ meter.text ?? $t(meter.labelKey) }}</span
          >
          <span
            v-if="!meter.text"
            class="tabular-nums"
            :class="
              meter.used > meter.limit
                ? 'font-medium text-destructive'
                : 'text-muted-foreground'
            "
            >{{
              $t('limits.usedOf', {
                used: number(meter.used),
                limit: number(meter.limit),
              })
            }}</span
          >
        </div>
        <div
          class="h-2 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          :aria-label="$t(meter.labelKey)"
          :aria-valuenow="meter.used"
          aria-valuemin="0"
          :aria-valuemax="meter.limit"
        >
          <div
            class="h-full rounded-full bg-primary transition-[width]"
            :class="{ 'bg-destructive': meter.used >= meter.limit }"
            :style="{
              width: `${Math.min(100, (meter.used / meter.limit) * 100)}%`,
            }"
          />
        </div>
      </div>
      <Alert v-if="overFields" variant="destructive">
        <AlertTitle>{{
          $t('limits.overFields', {
            used: number(overFields.used),
            limit: number(overFields.limit),
          })
        }}</AlertTitle>
        <AlertDescription>
          {{ $t('limits.overFieldsHelp', { limit: overFields.limit }) }}
          <NuxtLink to="/pricing">{{ $t('limits.seePlans') }}</NuxtLink>
        </AlertDescription>
      </Alert>
      <Alert v-if="overGames" variant="destructive">
        <AlertTitle>{{
          $t('limits.overLibrary', {
            used: number(overGames.used),
            limit: number(overGames.limit),
          })
        }}</AlertTitle>
        <AlertDescription>
          {{ $t('limits.overLibraryHelp', { limit: number(overGames.limit) }) }}
          <NuxtLink v-if="pro.games > overGames.limit" to="/pricing">{{
            $t('limits.proAllows', { limit: number(pro.games) })
          }}</NuxtLink>
        </AlertDescription>
      </Alert>
      <ul class="flex flex-col gap-1 text-sm text-muted-foreground">
        <li>
          {{
            $t('limits.perCollection', {
              games: number(limits.gamesPerCollection),
              charts: limits.chartsPerCollection,
            })
          }}
        </li>
        <li>
          {{
            $t('limits.perValue', {
              text: number(limits.textLength),
              rows: number(limits.importRows),
            })
          }}
        </li>
      </ul>
      <NuxtLink
        to="/pricing"
        class="self-start text-sm font-medium text-primary underline-offset-4 hover:underline"
        >{{ $t('limits.seePlans') }}</NuxtLink
      >
    </CardContent>
  </Card>
</template>
