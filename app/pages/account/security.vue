<script setup lang="ts">
const { t } = useI18n()
useHead(() => ({
  title: t('app.title', { page: t('account.security.pageTitle') }),
}))

const auth = useAuth()
const currentPassword = ref('')
const newPassword = ref('')
const confirmation = ref('')
const error = ref('')
const saved = ref(false)
const saving = ref(false)

async function save() {
  const problem = newPasswordProblem(newPassword.value, confirmation.value)
  error.value = problem ? t(problem.key, problem.params ?? {}) : ''
  saved.value = false
  if (error.value) return
  saving.value = true
  try {
    await auth.changePassword(currentPassword.value, newPassword.value)
    currentPassword.value = ''
    newPassword.value = ''
    confirmation.value = ''
    saved.value = true
  } catch (e) {
    error.value =
      (e as { name?: string }).name === 'NotAuthorizedException'
        ? t('account.security.wrongCurrent')
        : t(authErrorKey(e))
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle>
        <h2 class="text-lg font-semibold">
          {{ $t('account.security.title') }}
        </h2>
      </CardTitle>
      <CardDescription>{{
        $t('account.security.description')
      }}</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="flex flex-col gap-4" @submit.prevent="save">
        <FormMessage v-if="error">{{ error }}</FormMessage>
        <FormMessage v-if="saved" tone="success">
          {{ $t('account.security.saved') }}
        </FormMessage>
        <div class="flex flex-col gap-2">
          <Label for="current-password">{{
            $t('fields.currentPassword')
          }}</Label>
          <PasswordInput
            id="current-password"
            v-model="currentPassword"
            autocomplete="current-password"
          />
        </div>
        <NewPasswordFields
          v-model:password="newPassword"
          v-model:confirmation="confirmation"
          :label="$t('fields.newPassword')"
        />
        <div>
          <Button type="submit" :disabled="saving">
            {{
              saving
                ? $t('account.security.saving')
                : $t('account.security.save')
            }}
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>
</template>
