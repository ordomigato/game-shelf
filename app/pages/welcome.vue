<script setup lang="ts">
import { FetchError } from 'ofetch'

definePageMeta({ middleware: 'auth' })
useHead({ title: 'Welcome · GameShelf' })

const route = useRoute()
const auth = useAuth()
const username = ref(auth.me.value?.username ?? '')
const displayName = ref(auth.me.value?.displayName ?? '')
const error = ref('')
const submitting = ref(false)

const normalized = computed(() => normalizeUsername(username.value))

async function submit() {
  error.value = usernameProblem(normalized.value) ?? ''
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
        ? 'That username is taken. Try another one.'
        : 'Something went wrong. Try again.'
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <AuthCard
    title="Pick a username"
    description="Your username is how others find your shelf. You can change it later."
  >
    <form class="flex flex-col gap-4" @submit.prevent="submit">
      <FormMessage v-if="error">{{ error }}</FormMessage>
      <div class="flex flex-col gap-2">
        <Label for="username">Username</Label>
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
          3 to 20 letters, numbers or underscores. Your shelf will be at /u/{{
            normalized || 'yourname'
          }}.
        </p>
      </div>
      <div class="flex flex-col gap-2">
        <Label for="display-name">Display name (optional)</Label>
        <Input
          id="display-name"
          v-model="displayName"
          autocomplete="nickname"
          maxlength="50"
        />
      </div>
      <Button type="submit" :disabled="submitting">
        {{ submitting ? 'Saving…' : 'Continue' }}
      </Button>
    </form>
  </AuthCard>
</template>
