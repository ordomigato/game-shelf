<script setup lang="ts">
import { FetchError } from 'ofetch'

const { t } = useI18n()
useHead(() => ({
  title: t('app.title', { page: t('account.profile.pageTitle') }),
}))

const auth = useAuth()
const username = ref(auth.me.value?.username ?? '')
const displayName = ref(auth.me.value?.displayName ?? '')
const error = ref('')
const saved = ref(false)
const saving = ref(false)

async function save() {
  saved.value = false
  const normalized = normalizeUsername(username.value)
  const problem = usernameProblem(normalized)
  error.value = problem ? t(problem.key, problem.params ?? {}) : ''
  if (error.value) return
  saving.value = true
  try {
    await auth.updateProfile({
      username: normalized,
      displayName: displayName.value.trim() || null,
    })
    username.value = auth.me.value?.username ?? normalized
    saved.value = true
  } catch (e) {
    error.value =
      e instanceof FetchError && e.statusCode === 409
        ? t('username.taken')
        : t('common.genericError')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>
        <h2 class="text-lg font-semibold">{{ $t('account.profile.title') }}</h2>
      </CardTitle>
      <CardDescription>{{ $t('account.profile.description') }}</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="flex flex-col gap-4" @submit.prevent="save">
        <FormMessage v-if="error">{{ error }}</FormMessage>
        <FormMessage v-if="saved" tone="success">
          {{ $t('account.profile.saved') }}
        </FormMessage>
        <div class="flex flex-col gap-2">
          <Label for="username">{{ $t('fields.username') }}</Label>
          <Input
            id="username"
            v-model="username"
            autocapitalize="none"
            spellcheck="false"
            aria-describedby="username-hint"
            required
          />
          <p id="username-hint" class="text-xs text-muted-foreground">
            {{ $t('account.profile.usernameHint') }}
          </p>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="display-name">{{ $t('fields.displayName') }}</Label>
          <Input id="display-name" v-model="displayName" maxlength="50" />
        </div>
        <div>
          <Button type="submit" :disabled="saving">
            {{
              saving ? $t('account.profile.saving') : $t('account.profile.save')
            }}
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>
</template>
