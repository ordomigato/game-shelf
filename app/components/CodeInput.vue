<script setup lang="ts">
import { REGEXP_ONLY_DIGITS } from 'vue-input-otp'

/** A 6-digit code from an email, one box per digit. Pasting works too. */
const code = defineModel<string>({ default: '' })
const emit = defineEmits<{ complete: [code: string] }>()
</script>

<template>
  <InputOTP
    v-model="code"
    :maxlength="6"
    :pattern="REGEXP_ONLY_DIGITS"
    inputmode="numeric"
    autocomplete="one-time-code"
    :aria-label="$t('fields.codeLabel')"
    @complete="emit('complete', $event)"
  >
    <InputOTPGroup>
      <InputOTPSlot
        v-for="index in 6"
        :key="index"
        :index="index - 1"
        class="size-11 text-lg"
      />
    </InputOTPGroup>
  </InputOTP>
</template>
