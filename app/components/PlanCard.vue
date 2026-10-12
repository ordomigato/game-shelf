<script setup lang="ts">
import type { PlanUsage } from '#shared/types/user'

/** The account's plan and how much of it is used, in Settings. */
const auth = useAuth()
const { plan, limits } = usePlan()
const { locale } = useI18n()

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
        },
      ]
    : [],
)
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>
        <h2 class="text-lg font-semibold">
          {{
            plan === 'max'
              ? $t('limits.planMax')
              : plan === 'pro'
                ? $t('limits.planPro')
                : $t('limits.planFree')
          }}
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
          <span class="font-medium">{{ $t(meter.labelKey) }}</span>
          <span class="text-muted-foreground tabular-nums">{{
            $t('limits.usedOf', {
              used: number(meter.used),
              limit: number(meter.limit),
            })
          }}</span>
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
      <ul class="flex flex-col gap-1 text-sm text-muted-foreground">
        <li>
          {{
            $t('limits.perCollection', {
              games: number(limits.gamesPerCollection),
              fields: limits.fieldsPerCollection,
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
