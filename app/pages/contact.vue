<script setup lang="ts">
import { Check, Copy, Mail } from '@lucide/vue'
import { toast } from 'vue-sonner'

/** How to reach the developer: the address, to copy or open in a mail app. */
const { t } = useI18n()
useHead(() => ({ title: t('app.title', { page: t('contact.title') }) }))
useSeoMeta({
  description: () => t('contact.intro'),
  ogTitle: () => t('app.title', { page: t('contact.title') }),
  ogDescription: () => t('contact.intro'),
})

const copied = ref(false)
async function copy() {
  try {
    await navigator.clipboard.writeText(CONTACT_EMAIL)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    toast.error(t('contact.copyFailed'))
  }
}
</script>

<template>
  <article class="mx-auto flex max-w-2xl flex-col gap-8">
    <header class="flex flex-col gap-3">
      <h1 class="text-3xl font-bold">{{ $t('contact.title') }}</h1>
      <p class="text-lg leading-relaxed text-muted-foreground">
        {{ $t('contact.intro') }}
      </p>
    </header>

    <div
      class="flex flex-col gap-4 rounded-xl border border-border bg-card p-6 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="flex min-w-0 flex-col gap-1">
        <span class="text-sm text-muted-foreground">{{
          $t('contact.emailLabel')
        }}</span>
        <span class="truncate text-lg font-semibold select-all">{{
          CONTACT_EMAIL
        }}</span>
      </div>
      <div class="flex gap-2">
        <Button variant="outline" @click="copy">
          <Check v-if="copied" aria-hidden="true" />
          <Copy v-else aria-hidden="true" />
          {{ copied ? $t('contact.copied') : $t('contact.copy') }}
        </Button>
        <Button as-child>
          <a :href="`mailto:${CONTACT_EMAIL}`">
            <Mail aria-hidden="true" />
            {{ $t('contact.send') }}
          </a>
        </Button>
      </div>
    </div>

    <p class="leading-relaxed text-muted-foreground">
      {{ $t('contact.reply') }}
    </p>
  </article>
</template>
