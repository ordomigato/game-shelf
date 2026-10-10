<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
useHead(() => ({ title: t('app.title', { page: t('signIn.pageTitle') }) }))

const route = useRoute()
const auth = useAuth()
const email = ref('')
const password = ref('')
const error = ref('')
const submitting = ref(false)

const notice = computed(() => {
  if (route.query.verified) return t('signIn.verified')
  if (route.query.reset) return t('signIn.passwordChanged')
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
    error.value = t(authErrorKey(e))
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthCard :title="$t('signIn.title')" :description="$t('signIn.description')">
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <FormMessage v-if="notice" tone="success">{{ notice }}</FormMessage>
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
      <div class="flex flex-col gap-2">
        <div class="flex items-center justify-between">
          <Label for="password">{{ $t('fields.password') }}</Label>
          <NuxtLink
            to="/forgot-password"
            class="text-sm text-primary hover:underline"
          >
            {{ $t('signIn.forgotPassword') }}
          </NuxtLink>
        </div>
        <PasswordInput
          id="password"
          v-model="password"
          autocomplete="current-password"
        />
      </div>
      <Button type="submit" :disabled="submitting">
        {{ submitting ? $t('signIn.submitting') : $t('signIn.submit') }}
      </Button>
    </form>
    <template #footer>
      <p>
        {{ $t('signIn.newHere') }}
        <NuxtLink to="/signup" class="font-medium text-primary hover:underline">
          {{ $t('signIn.createAccount') }}
        </NuxtLink>
      </p>
    </template>
  </AuthCard>
</template>
