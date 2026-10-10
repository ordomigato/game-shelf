<script setup lang="ts">
import { Eye, EyeOff } from '@lucide/vue'

/** A password field with a button to show or hide what's typed. */
const password = defineModel<string>({ default: '' })
defineProps<{ id: string; autocomplete: string; describedby?: string }>()

const visible = ref(false)
</script>

<template>
  <div class="relative">
    <Input
      :id="id"
      v-model="password"
      :type="visible ? 'text' : 'password'"
      :autocomplete="autocomplete"
      :aria-describedby="describedby"
      autocapitalize="none"
      spellcheck="false"
      class="pr-10"
      required
    />
    <button
      type="button"
      class="absolute inset-y-0 right-0 flex w-10 items-center justify-center rounded-r-md text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      :aria-label="
        visible ? $t('fields.hidePassword') : $t('fields.showPassword')
      "
      :aria-pressed="visible"
      @click="visible = !visible"
    >
      <EyeOff v-if="visible" class="size-4" />
      <Eye v-else class="size-4" />
    </button>
  </div>
</template>
