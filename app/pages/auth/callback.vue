<script setup lang="ts">
/**
 * Where Cognito sends the browser back after a social sign-in. Amplify
 * swaps the code for tokens on its own; this page waits for that, then
 * goes on to where the person was headed (or to pick a username first).
 */
const { t } = useI18n()
useHead(() => ({
  title: t('app.title', { page: t('socialSignIn.pageTitle') }),
}))

const route = useRoute()
const auth = useAuth()
const problem = ref('')

onMounted(async () => {
  const pending = takePendingSocialSignIn()
  const redirect = safeRedirect(pending?.redirect)
  const failure = route.query.error_description ?? route.query.error

  if (typeof failure === 'string') {
    const kind = socialSignInProblem(failure)
    // Just linked, or the linking ran long: the second try goes straight in.
    if (kind === 'retry' && pending && !pending.retried) {
      await auth.signInWithSocial(pending.provider, redirect, true)
      return
    }
    problem.value =
      kind === 'unverifiedEmail'
        ? t('socialSignIn.unverifiedEmail')
        : t('socialSignIn.failed')
    return
  }

  await auth.ensureLoaded()
  if (auth.status.value !== 'signedIn') {
    problem.value = t('socialSignIn.failed')
    return
  }
  await navigateTo(
    auth.me.value?.username
      ? redirect
      : { path: '/welcome', query: { redirect } },
    { replace: true },
  )
})
</script>

<template>
  <AuthCard
    :title="problem ? $t('socialSignIn.failedTitle') : $t('socialSignIn.title')"
  >
    <div v-if="problem" class="flex flex-col gap-4">
      <FormMessage>{{ problem }}</FormMessage>
      <Button as-child>
        <NuxtLink to="/login">{{ $t('socialSignIn.backToSignIn') }}</NuxtLink>
      </Button>
    </div>
    <p v-else class="text-sm text-muted-foreground" role="status">
      {{ $t('socialSignIn.working') }}
    </p>
  </AuthCard>
</template>
