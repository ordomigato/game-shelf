<script setup lang="ts">
import { FetchError } from 'ofetch'

definePageMeta({ middleware: 'auth' })

const { t } = useI18n()
useHead(() => ({ title: t('app.title', { page: t('welcome.pageTitle') }) }))

const route = useRoute()
const auth = useAuth()
const username = ref(auth.me.value?.username ?? '')
const displayName = ref(auth.me.value?.displayName ?? '')
const error = ref('')
const submitting = ref(false)

const normalized = computed(() => normalizeUsername(username.value))

async function submit() {
  const problem = usernameProblem(normalized.value)
  error.value = problem ? t(problem.key, problem.params ?? {}) : ''
  if (error.value) return
  submitting.value = true
  try {
    await auth.updateProfile({
      username: normalized.value,
      displayName: displayName.value.trim() || null,
    })
    await navigateTo(safeRedirect(route.query.redirect))
  } catch (e) {
    error.value =
      e instanceof FetchError && e.statusCode === 409
        ? t('username.taken')
        : t('common.genericError')
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthCard
    :title="$t('welcome.title')"
    :description="$t('welcome.description')"
  >
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <FormMessage v-if="error">{{ error }}</FormMessage>
      <div class="flex flex-col gap-2">
        <Label for="username">{{ $t('fields.username') }}</Label>
        <Input
          id="username"
          v-model="username"
          autocomplete="username"
          autocapitalize="none"
          spellcheck="false"
          aria-describedby="username-hint"
          required
        />
        <p id="username-hint" class="text-xs text-muted-foreground">
          {{
            $t('welcome.usernameHint', {
              username: normalized || $t('welcome.usernamePlaceholder'),
            })
          }}
        </p>
      </div>
      <div class="flex flex-col gap-2">
        <Label for="display-name">{{ $t('fields.displayNameOptional') }}</Label>
        <Input
          id="display-name"
          v-model="displayName"
          autocomplete="nickname"
          maxlength="50"
        />
      </div>
      <Button type="submit" :disabled="submitting">
        {{ submitting ? $t('welcome.submitting') : $t('welcome.submit') }}
      </Button>
    </form>
  </AuthCard>
</template>
