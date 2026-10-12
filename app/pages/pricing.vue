<script setup lang="ts">
import { Check } from '@lucide/vue'
import { PLAN_LIMITS, PLUS_PRICE_PER_YEAR } from '#shared/utils/plans'

/**
 * The free plan and the planned paid one, with every limit listed from the
 * same numbers the server enforces. Rendered on the server.
 */
const { t, locale } = useI18n()
useHead(() => ({ title: t('app.title', { page: t('pricing.title') }) }))
useSeoMeta({
  description: () => t('pricing.intro'),
  ogTitle: () => t('app.title', { page: t('pricing.title') }),
  ogDescription: () => t('pricing.intro'),
})

const { signedIn } = useViewer()
const { plan } = usePlan()
const number = (value: number) =>
  new Intl.NumberFormat(locale.value).format(value)

const rows = computed(() =>
  (['free', 'plus'] as const).map((name) => {
    const limits = PLAN_LIMITS[name]
    return {
      name,
      items: [
        t('pricing.collections', { count: number(limits.collections) }),
        t('pricing.games', { count: number(limits.games) }),
        t('pricing.gamesPerCollection', {
          count: number(limits.gamesPerCollection),
        }),
        t('pricing.fields', { count: limits.fieldsPerCollection }),
        t('pricing.charts', { count: limits.chartsPerCollection }),
        t('pricing.text', { count: number(limits.textLength) }),
        t('pricing.importRows', { count: number(limits.importRows) }),
      ],
    }
  }),
)
const free = computed(() => rows.value[0]!)
const plus = computed(() => rows.value[1]!)
</script>

<template>
  <article class="mx-auto flex max-w-3xl flex-col gap-10">
    <header class="flex flex-col gap-3">
      <h1 class="text-3xl font-bold">{{ $t('pricing.title') }}</h1>
      <p class="text-lg leading-relaxed text-muted-foreground">
        {{ $t('pricing.intro') }}
      </p>
    </header>

    <div class="grid gap-4 sm:grid-cols-2">
      <section
        class="flex flex-col gap-4 rounded-xl border border-border bg-card p-6"
        aria-labelledby="plan-free"
      >
        <div class="flex items-center justify-between gap-2">
          <h2 id="plan-free" class="text-xl font-semibold">
            {{ $t('pricing.freeName') }}
          </h2>
          <Badge v-if="signedIn && plan === 'free'" variant="secondary">{{
            $t('pricing.yourPlan')
          }}</Badge>
        </div>
        <p>
          <span class="text-3xl font-bold">{{ $t('pricing.freePrice') }}</span>
        </p>
        <ul class="flex flex-col gap-2 text-sm">
          <li v-for="item in free.items" :key="item" class="flex gap-2">
            <Check
              class="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            {{ item }}
          </li>
        </ul>
        <Button v-if="!signedIn" as-child class="mt-auto">
          <NuxtLink to="/signup">{{ $t('pricing.freeCta') }}</NuxtLink>
        </Button>
      </section>

      <section
        class="flex flex-col gap-4 rounded-xl border border-dashed border-border bg-card/60 p-6"
        aria-labelledby="plan-plus"
      >
        <div class="flex items-center justify-between gap-2">
          <h2 id="plan-plus" class="text-xl font-semibold">
            {{ $t('pricing.plusName') }}
          </h2>
          <Badge variant="outline">{{ $t('pricing.comingSoon') }}</Badge>
        </div>
        <p class="flex items-baseline gap-1">
          <span class="text-3xl font-bold">{{
            $t('pricing.plusPrice', { price: PLUS_PRICE_PER_YEAR })
          }}</span>
          <span class="text-sm text-muted-foreground">{{
            $t('pricing.perYear')
          }}</span>
        </p>
        <ul class="flex flex-col gap-2 text-sm">
          <li v-for="item in plus.items" :key="item" class="flex gap-2">
            <Check
              class="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            {{ item }}
          </li>
        </ul>
        <Button class="mt-auto" disabled>{{ $t('pricing.comingSoon') }}</Button>
      </section>
    </div>

    <ProseSection :title="$t('pricing.whyTitle')">
      <p>{{ $t('pricing.why') }}</p>
      <p>{{ $t('pricing.whyPlus') }}</p>
    </ProseSection>

    <ProseSection :title="$t('pricing.limitsTitle')">
      <p>{{ $t('pricing.limits') }}</p>
    </ProseSection>
  </article>
</template>
