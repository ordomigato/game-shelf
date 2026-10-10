<script setup lang="ts">
import { Shapes } from '@lucide/vue'

definePageMeta({ middleware: 'auth' })

const { t } = useI18n()
useHead(() => ({ title: t('app.title', { page: t('blueprintsPage.title') }) }))

const collections = useCollections()
const { data, status, error, refresh } = useAsyncData('blueprints', () =>
  collections.blueprints(),
)
</script>

<template>
  <div class="mx-auto flex w-full max-w-3xl flex-col gap-6">
    <div>
      <h1 class="text-3xl font-bold">{{ $t('blueprintsPage.title') }}</h1>
      <p class="mt-1 text-muted-foreground">
        {{ $t('blueprintsPage.description') }}
      </p>
    </div>

    <div v-if="status === 'pending' && !data" class="flex flex-col gap-3">
      <Skeleton v-for="n in 3" :key="n" class="h-20 w-full" />
    </div>

    <div v-else-if="error" class="py-12 text-center">
      <p class="text-lg font-medium">{{ $t('blueprintsPage.loadFailed') }}</p>
      <Button class="mt-4" @click="refresh()">{{ $t('shelf.retry') }}</Button>
    </div>

    <div
      v-else-if="!data?.length"
      class="rounded-lg border border-dashed py-12 text-center"
    >
      <Shapes class="mx-auto size-8 text-muted-foreground" aria-hidden="true" />
      <p class="mt-3 font-medium">{{ $t('blueprintsPage.empty') }}</p>
      <p class="mt-1 text-sm text-muted-foreground">
        {{ $t('blueprintsPage.emptyHint') }}
      </p>
    </div>

    <ul v-else class="flex flex-col gap-3">
      <li v-for="blueprint in data" :key="blueprint.id">
        <NuxtLink
          :to="`/blueprints/${blueprint.id}`"
          class="flex flex-col gap-1 rounded-lg border bg-card p-4 shadow-sm outline-none transition hover:border-primary focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span class="font-heading text-lg font-semibold">{{
            blueprint.name
          }}</span>
          <span class="text-sm text-muted-foreground">
            {{
              $t(
                'collections.form.fieldCount',
                { count: blueprint.fieldCount },
                blueprint.fieldCount,
              )
            }}
            ·
            {{
              $t(
                'blueprintsPage.usedBy',
                { count: blueprint.usedBy },
                blueprint.usedBy,
              )
            }}
          </span>
        </NuxtLink>
      </li>
    </ul>
  </div>
</template>
