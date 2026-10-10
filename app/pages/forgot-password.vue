<script setup lang="ts">
definePageMeta({ middleware: 'guest' })
useHead({ title: 'Reset your password · GameShelf' })

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
    error.value = authErrorMessage(e)
  } finally {
    submitting.value = false
  }
}

async function reset() {
  error.value =
    code.value.length === 6 ? '' : 'Enter the 6-digit code from the email.'
  error.value ||=
    newPasswordProblem(newPassword.value, confirmation.value) ?? ''
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
    error.value = authErrorMessage(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthCard
    title="Reset your password"
    :description="
      step === 'email'
        ? 'Enter your email and we will send you a code.'
        : `If an account exists for ${email.trim()}, we sent it a 6-digit code. Enter it with a new password.`
    "
  >
    <form
      v-if="step === 'email'"
      class="flex flex-col gap-4"
      @submit.prevent="sendCode"
    >
      <FormMessage v-if="error">{{ error }}</FormMessage>
      <div class="flex flex-col gap-2">
        <Label for="email">Email</Label>
        <Input
          id="email"
          v-model="email"
          type="email"
          autocomplete="email"
          required
        />
      </div>
      <Button type="submit" :disabled="submitting">
        {{ submitting ? 'Sending…' : 'Send code' }}
      </Button>
    </form>
    <form v-else class="flex flex-col gap-4" @submit.prevent="reset">
      <FormMessage v-if="error">{{ error }}</FormMessage>
      <div class="flex flex-col gap-2">
        <Label>Code</Label>
        <CodeInput v-model="code" />
      </div>
      <NewPasswordFields
        v-model:password="newPassword"
        v-model:confirmation="confirmation"
        label="New password"
      />
      <Button type="submit" :disabled="submitting">
        {{ submitting ? 'Saving…' : 'Save new password' }}
      </Button>
    </form>
    <template #footer>
      <NuxtLink to="/login" class="text-primary hover:underline"
        >Back to sign in</NuxtLink
      >
    </template>
  </AuthCard>
</template>
