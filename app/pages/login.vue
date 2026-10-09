<script setup lang="ts">
definePageMeta({ middleware: 'guest' })
useHead({ title: 'Sign in · GameShelf' })

const route = useRoute()
const auth = useAuth()
const email = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

const notice = computed(() => {
  if (route.query.verified)
    return 'Your email is verified. Sign in to continue.'
  if (route.query.reset)
    return 'Your password is changed. Sign in with the new one.'
  return ''
})

async function submit() {
  error.value = ''
  submitting.value = true
  try {
    const result = await auth.signIn(email.value.trim(), password.value)
    if (result === 'needsConfirmation') {
      await auth.resendCode(email.value.trim()).catch(() => {})
      await navigateTo({
        path: '/verify',
        query: { email: email.value.trim() },
      })
      return
    }
    const redirect = safeRedirect(route.query.redirect)
    if (!auth.me.value?.username) {
      await navigateTo({ path: '/welcome', query: { redirect } })
    } else {
      await navigateTo(redirect)
    }
  } catch (e) {
    error.value = authErrorMessage(e)
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthCard title="Sign in" description="Welcome back to your shelf.">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <FormMessage v-if="notice" tone="success">{{ notice }}</FormMessage>
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
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <Label for="password">Password</Label>
          <NuxtLink
            to="/forgot-password"
            class="text-sm text-primary hover:underline"
          >
            Forgot password?
          </NuxtLink>
        </div>
        <PasswordInput
          id="password"
          v-model="password"
          autocomplete="current-password"
        />
      </div>
      <Button type="submit" :disabled="submitting">
        {{ submitting ? 'Signing in…' : 'Sign in' }}
      </Button>
    </form>
    <template #footer>
      <p>
        New to GameShelf?
        <NuxtLink to="/signup" class="font-medium text-primary hover:underline">
          Create an account
        </NuxtLink>
      </p>
    </template>
  </AuthCard>
</template>
