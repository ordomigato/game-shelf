<script setup lang="ts">
import { Check } from '@lucide/vue'
import { PLAN_LIMITS } from '#shared/utils/plans'

/**
 * Free, and Pro (free too, granted on request), with every limit listed
 * from the same numbers the server enforces. Rendered on the server.
 */
const { t, locale } = useI18n()
useHead(() => ({ title: t('app.title', { page: t('pricing.title') }) }))
useSeoMeta({
  description: () => t('seo.descriptions.pricing'),
  ogTitle: () => t('app.title', { page: t('pricing.title') }),
  ogDescription: () => t('seo.descriptions.pricing'),
})

const { signedIn } = useViewer()
const { plan } = usePlan()
const number = (value: number) =>
  new Intl.NumberFormat(locale.value).format(value)

const rows = computed(() =>
  (['free', 'pro'] as const).map((name) => {
    const limits = PLAN_LIMITS[name]
    return {
      name,
      items: [
        t('pricing.collections', { count: number(limits.collections) }),
        t('pricing.games', { count: number(limits.games) }),
        t('pricing.gamesPerCollection', {
          count: number(limits.gamesPerCollection),
        }),
        t('pricing.fields', { count: limits.fields }),
        t('pricing.charts', { count: limits.chartsPerCollection }),
        t('pricing.text', { count: number(limits.textLength) }),
        t('pricing.importRows', { count: number(limits.importRows) }),
      ],
    }
  }),
)
const free = computed(() => rows.value[0]!)
const pro = computed(() => rows.value[1]!)
</script>

<template>
  <article class="mx-auto flex max-w-5xl flex-col gap-10">
    <header class="flex flex-col gap-3">
      <h1 class="text-3xl font-bold">{{ $t('pricing.title') }}</h1>
      <p class="leading-relaxed text-muted-foreground">
        {{ $t('pricing.intro') }}
      </p>
    </header>

    <div class="grid gap-4 md:grid-cols-2">
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
        <p class="text-sm text-muted-foreground">
          {{ $t('pricing.freeBlurb') }}
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
        class="flex flex-col gap-4 rounded-xl border border-border bg-card p-6"
        aria-labelledby="plan-pro"
      >
        <div class="flex items-center justify-between gap-2">
          <h2 id="plan-pro" class="text-xl font-semibold">
            {{ $t('pricing.proName') }}
          </h2>
          <Badge v-if="signedIn && plan === 'pro'" variant="secondary">{{
            $t('pricing.yourPlan')
          }}</Badge>
        </div>
        <p>
          <span class="text-3xl font-bold">{{ $t('pricing.proPrice') }}</span>
        </p>
        <p class="text-sm text-muted-foreground">
          {{ $t('pricing.proBlurb') }}
        </p>
        <ul class="flex flex-col gap-2 text-sm">
          <li v-for="item in pro.items" :key="item" class="flex gap-2">
            <Check
              class="mt-0.5 size-4 shrink-0 text-primary"
              aria-hidden="true"
            />
            {{ item }}
          </li>
        </ul>
        <p class="text-sm text-muted-foreground">
          {{ $t('pricing.proMore') }}
        </p>
        <Button as-child variant="outline" class="mt-auto">
          <NuxtLink to="/contact">{{ $t('pricing.proCta') }}</NuxtLink>
        </Button>
      </section>
    </div>

    <ProseSection :title="$t('pricing.whyTitle')">
      <p>{{ $t('pricing.why') }}</p>
    </ProseSection>

    <ProseSection :title="$t('pricing.limitsTitle')">
      <p>{{ $t('pricing.limits') }}</p>
    </ProseSection>
  </article>
</template>
