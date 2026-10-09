<script setup lang="ts">
useHead({ title: 'Security · GameShelf' })

const auth = useAuth()
const currentPassword = ref('')
const newPassword = ref('')
const confirmation = ref('')
const error = ref('')
const saved = ref(false)
const saving = ref(false)

async function save() {
  error.value = newPasswordProblem(newPassword.value, confirmation.value) ?? ''
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
        ? "Your current password isn't right."
        : authErrorMessage(e)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle><h2 class="text-lg font-semibold">Password</h2></CardTitle>
      <CardDescription>Change the password you sign in with.</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="flex flex-col gap-4" @submit.prevent="save">
        <FormMessage v-if="error">{{ error }}</FormMessage>
        <FormMessage v-if="saved" tone="success">Password changed.</FormMessage>
        <div class="flex flex-col gap-2">
          <Label for="current-password">Current password</Label>
          <PasswordInput
            id="current-password"
            v-model="currentPassword"
            autocomplete="current-password"
          />
        </div>
        <NewPasswordFields
          v-model:password="newPassword"
          v-model:confirmation="confirmation"
          label="New password"
        />
        <div>
          <Button type="submit" :disabled="saving">
            {{ saving ? 'Saving…' : 'Change password' }}
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>
</template>
