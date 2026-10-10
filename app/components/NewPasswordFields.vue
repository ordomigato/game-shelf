<script setup lang="ts">
import { Check, Circle } from '@lucide/vue'

/**
 * A new password and its confirmation, with a checklist that ticks off the
 * rules as they're met. The parent checks `newPasswordProblem` before
 * submitting.
 */
const password = defineModel<string>('password', { default: '' })
const confirmation = defineModel<string>('confirmation', { default: '' })
const props = withDefaults(
  defineProps<{
    /** Label for the first field. Defaults to "Password". */
    label?: string
    idPrefix?: string
  }>(),
  { label: undefined, idPrefix: 'new' },
)
const { t } = useI18n()

const rules = computed(() => [
  ...passwordRules(password.value),
  {
    key: 'password.rules.match',
    met: password.value.length > 0 && password.value === confirmation.value,
  },
])
const passwordId = computed(() => `${props.idPrefix}-password`)
const confirmationId = computed(() => `${props.idPrefix}-password-confirmation`)
const rulesId = computed(() => `${props.idPrefix}-password-rules`)
</script>

<template>
  <div class="flex flex-col gap-4">
    <div class="flex flex-col gap-2">
      <Label :for="passwordId">{{ label ?? t('fields.password') }}</Label>
      <PasswordInput
        :id="passwordId"
        v-model="password"
        autocomplete="new-password"
        :describedby="rulesId"
      />
    </div>
    <div class="flex flex-col gap-2">
      <Label :for="confirmationId">{{ $t('fields.confirmPassword') }}</Label>
      <PasswordInput
        :id="confirmationId"
        v-model="confirmation"
        autocomplete="new-password"
        :describedby="rulesId"
      />
    </div>
    <ul
      :id="rulesId"
      class="grid gap-1 text-xs sm:grid-cols-2"
      :aria-label="$t('password.rulesLabel')"
    >
      <li
        v-for="rule in rules"
        :key="rule.key"
        class="flex items-center gap-1.5"
        :class="rule.met ? 'text-foreground' : 'text-muted-foreground'"
      >
        <Check
          v-if="rule.met"
          class="size-3.5 text-primary"
          aria-hidden="true"
        />
        <Circle v-else class="size-3.5" aria-hidden="true" />
        {{ $t(rule.key, rule.params ?? {}) }}
        <span class="sr-only">{{
          rule.met ? $t('password.ruleDone') : $t('password.ruleNotYet')
        }}</span>
      </li>
    </ul>
  </div>
</template>
