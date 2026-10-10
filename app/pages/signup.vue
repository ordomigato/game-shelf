<script setup lang="ts">
definePageMeta({ middleware: 'guest' })
useHead({ title: 'Create an account · GameShelf' })

const auth = useAuth()
const email = ref('')
const password = ref('')
const confirmation = ref('')
const error = ref('')
const submitting = ref(false)

async function submit() {
  error.value = newPasswordProblem(password.value, confirmation.value) ?? ''
  if (error.value) return
  submitting.value = true
  try {
    await auth.signUp(email.value.trim(), password.value)
    await navigateTo({ path: '/verify', query: { email: email.value.trim() } })
  } catch (e) {
    error.value = authErrorMessage(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthCard
    title="Create an account"
    description="Save games to your shelf and build collections your way."
  >
    <form class="flex flex-col gap-4" @submit.prevent="submit">
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
      <NewPasswordFields
        v-model:password="password"
        v-model:confirmation="confirmation"
      />
      <Button type="submit" :disabled="submitting">
        {{ submitting ? 'Creating account…' : 'Create account' }}
      </Button>
    </form>
    <template #footer>
      <p>
        Already have an account?
        <NuxtLink to="/login" class="font-medium text-primary hover:underline"
          >Sign in</NuxtLink
        >
      </p>
    </template>
  </AuthCard>
</template>
