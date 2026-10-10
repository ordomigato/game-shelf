<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
useHead(() => ({
  title: t('app.title', { page: t('resetPassword.pageTitle') }),
}))

const auth = useAuth()
const step = ref<'email' | 'reset'>('email')
const email = ref('')
const code = ref('')
const newPassword = ref('')
const confirmation = ref('')
const error = ref('')
const submitting = ref(false)

async function sendCode() {
  error.value = ''
  submitting.value = true
  try {
    await auth.requestPasswordReset(email.value.trim())
    step.value = 'reset'
  } catch (e) {
    error.value = t(authErrorKey(e))
  } finally {
    submitting.value = false
  }
}

async function reset() {
  const problem = newPasswordProblem(newPassword.value, confirmation.value)
  if (code.value.length !== 6) error.value = t('resetPassword.codeMissing')
  else if (problem) error.value = t(problem.key, problem.params ?? {})
  else error.value = ''
  if (error.value) return
  submitting.value = true
  try {
    await auth.confirmPasswordReset(
      email.value.trim(),
      code.value,
      newPassword.value,
    )
    await navigateTo({ path: '/login', query: { reset: '1' } })
  } catch (e) {
    error.value = t(authErrorKey(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthCard
    :title="$t('resetPassword.title')"
    :description="
      step === 'email'
        ? $t('resetPassword.askEmail')
        : $t('resetPassword.codeSent', { email: email.trim() })
    "
  >
    <form
      v-if="step === 'email'"
      class="flex flex-col gap-4"
      @submit.prevent="sendCode"
    >
      <FormMessage v-if="error">{{ error }}</FormMessage>
      <div class="flex flex-col gap-2">
        <Label for="email">{{ $t('fields.email') }}</Label>
        <Input
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
        />
      </div>
      <Button type="submit" :disabled="submitting">
        {{
          submitting
            ? $t('resetPassword.sending')
            : $t('resetPassword.sendCode')
        }}
      </Button>
    </form>
    <form v-else class="flex flex-col gap-4" @submit.prevent="reset">
      <FormMessage v-if="error">{{ error }}</FormMessage>
      <div class="flex flex-col gap-2">
        <Label>{{ $t('fields.code') }}</Label>
        <CodeInput v-model="code" />
      </div>
      <NewPasswordFields
        v-model:password="newPassword"
        v-model:confirmation="confirmation"
        :label="$t('fields.newPassword')"
      />
      <Button type="submit" :disabled="submitting">
        {{ submitting ? $t('resetPassword.saving') : $t('resetPassword.save') }}
      </Button>
    </form>
    <template #footer>
      <NuxtLink to="/login" class="text-primary hover:underline">
        {{ $t('resetPassword.backToSignIn') }}
      </NuxtLink>
    </template>
  </AuthCard>
</template>
