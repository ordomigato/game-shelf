<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
useHead(() => ({ title: t('app.title', { page: t('signUp.pageTitle') }) }))

const auth = useAuth()
const email = ref('')
const password = ref('')
const confirmation = ref('')
const error = ref('')
const submitting = ref(false)

async function submit() {
  const problem = newPasswordProblem(password.value, confirmation.value)
  error.value = problem ? t(problem.key, problem.params ?? {}) : ''
  if (error.value) return
  submitting.value = true
  try {
    await auth.signUp(email.value.trim(), password.value)
    await navigateTo({ path: '/verify', query: { email: email.value.trim() } })
  } catch (e) {
    error.value = t(authErrorKey(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthCard :title="$t('signUp.title')" :description="$t('signUp.description')">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
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
      <NewPasswordFields
        v-model:password="password"
        v-model:confirmation="confirmation"
      />
      <Button type="submit" :disabled="submitting">
        {{ submitting ? $t('signUp.submitting') : $t('signUp.submit') }}
      </Button>
    </form>
    <template #footer>
      <p>
        {{ $t('signUp.haveAccount') }}
        <NuxtLink to="/login" class="font-medium text-primary hover:underline">
          {{ $t('signUp.signInLink') }}
        </NuxtLink>
      </p>
    </template>
  </AuthCard>
</template>
