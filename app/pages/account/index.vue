<script setup lang="ts">
import { FetchError } from 'ofetch'

useHead({ title: 'Profile · GameShelf' })

const auth = useAuth()
const username = ref(auth.me.value?.username ?? '')
const displayName = ref(auth.me.value?.displayName ?? '')
const error = ref('')
const saved = ref(false)
const saving = ref(false)

async function save() {
  saved.value = false
  const normalized = normalizeUsername(username.value)
  error.value = usernameProblem(normalized) ?? ''
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
        ? 'That username is taken. Try another one.'
        : 'Something went wrong. Try again.'
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <Card>
    <CardHeader>
      <CardTitle><h2 class="text-lg font-semibold">Profile</h2></CardTitle>
      <CardDescription>How you appear to others on GameShelf.</CardDescription>
    </CardHeader>
    <CardContent>
      <form class="flex flex-col gap-4" @submit.prevent="save">
        <FormMessage v-if="error">{{ error }}</FormMessage>
        <FormMessage v-if="saved" tone="success">Profile saved.</FormMessage>
        <div class="flex flex-col gap-2">
          <Label for="username">Username</Label>
          <Input
            id="username"
            v-model="username"
            autocapitalize="none"
            spellcheck="false"
            aria-describedby="username-hint"
            required
          />
          <p id="username-hint" class="text-xs text-muted-foreground">
            Changing it changes your shelf's address. Old links stop working.
          </p>
        </div>
        <div class="flex flex-col gap-2">
          <Label for="display-name">Display name</Label>
          <Input id="display-name" v-model="displayName" maxlength="50" />
        </div>
        <div>
          <Button type="submit" :disabled="saving">
            {{ saving ? 'Saving…' : 'Save profile' }}
          </Button>
        </div>
      </form>
    </CardContent>
  </Card>
</template>
