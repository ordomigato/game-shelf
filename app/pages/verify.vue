<script setup lang="ts">
definePageMeta({ middleware: 'guest' })
useHead({ title: 'Check your email · GameShelf' })

const route = useRoute()
const auth = useAuth()
const email = computed(() =>
  typeof route.query.email === 'string' ? route.query.email : '',
)
const code = ref('')
const error = ref('')
const notice = ref('')
const submitting = ref(false)

async function submit() {
  if (code.value.length !== 6 || submitting.value) return
  error.value = ''
  notice.value = ''
  submitting.value = true
  try {
    const signedIn = await auth.confirmSignUp(email.value, code.value)
    if (signedIn) await navigateTo('/welcome')
    else await navigateTo({ path: '/login', query: { verified: '1' } })
  } catch (e) {
    error.value = authErrorMessage(e)
    code.value = ''
  } finally {
    submitting.value = false
  }
}

async function resend() {
  error.value = ''
  notice.value = ''
  try {
    await auth.resendCode(email.value)
    notice.value = 'We sent a new code. Check your email.'
  } catch (e) {
    error.value = authErrorMessage(e)
  }
}
</script>

<template>
  <AuthCard v-if="email" title="Check your email">
    <div class="flex flex-col gap-5">
      <p class="text-sm text-muted-foreground">
        We sent a 6-digit code to
        <strong class="font-medium text-foreground">{{ email }}</strong
        >. Enter it below to finish creating your account.
      </p>
      <FormMessage v-if="error">{{ error }}</FormMessage>
      <FormMessage v-if="notice" tone="success">{{ notice }}</FormMessage>
      <form class="flex flex-col gap-5" @submit.prevent="submit">
        <CodeInput v-model="code" @complete="submit" />
        <Button type="submit" :disabled="submitting || code.length !== 6">
          {{ submitting ? 'Checking…' : 'Verify email' }}
        </Button>
      </form>
    </div>
    <template #footer>
      <p>
        Didn't get it? Check your spam folder, or
        <button
          type="button"
          class="font-medium text-primary hover:underline"
          @click="resend"
        >
          send a new code</button
        >.
      </p>
      <p>
        Wrong email?
        <NuxtLink to="/signup" class="font-medium text-primary hover:underline"
          >Start again</NuxtLink
        >
      </p>
    </template>
  </AuthCard>
  <AuthCard v-else title="Check your email">
    <p class="text-sm text-muted-foreground">
      Open the link from the sign-up page to enter your code, or sign in and we
      will send a new one.
    </p>
    <template #footer>
      <NuxtLink to="/login" class="font-medium text-primary hover:underline"
        >Go to sign in</NuxtLink
      >
    </template>
  </AuthCard>
</template>
