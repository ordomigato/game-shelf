<script setup lang="ts">
definePageMeta({ middleware: 'guest' })

const { t } = useI18n()
useHead(() => ({ title: t('app.title', { page: t('verify.pageTitle') }) }))

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
    error.value = t(authErrorKey(e))
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
    notice.value = t('verify.resent')
  } catch (e) {
    error.value = t(authErrorKey(e))
  }
}
</script>

<template>
  <AuthCard v-if="email" :title="$t('verify.title')">
    <div class="flex flex-col gap-5">
      <i18n-t
        keypath="verify.sentTo"
        tag="p"
        class="text-sm text-muted-foreground"
      >
        <template #email>
          <strong class="font-medium text-foreground">{{ email }}</strong>
        </template>
      </i18n-t>
      <FormMessage v-if="error">{{ error }}</FormMessage>
      <FormMessage v-if="notice" tone="success">{{ notice }}</FormMessage>
      <form class="flex flex-col gap-5" @submit.prevent="submit">
        <CodeInput v-model="code" @complete="submit" />
        <Button type="submit" :disabled="submitting || code.length !== 6">
          {{ submitting ? $t('verify.submitting') : $t('verify.submit') }}
        </Button>
      </form>
    </div>
    <template #footer>
      <i18n-t keypath="verify.notReceived" tag="p">
        <template #resend>
          <button
            type="button"
            class="font-medium text-primary hover:underline"
            @click="resend"
          >
            {{ $t('verify.resend') }}
          </button>
        </template>
      </i18n-t>
      <p>
        {{ $t('verify.wrongEmail') }}
        <NuxtLink to="/signup" class="font-medium text-primary hover:underline">
          {{ $t('verify.startAgain') }}
        </NuxtLink>
      </p>
    </template>
  </AuthCard>
  <AuthCard v-else :title="$t('verify.title')">
    <p class="text-sm text-muted-foreground">{{ $t('verify.noEmail') }}</p>
    <template #footer>
      <NuxtLink to="/login" class="font-medium text-primary hover:underline">
        {{ $t('verify.goToSignIn') }}
      </NuxtLink>
    </template>
  </AuthCard>
</template>
