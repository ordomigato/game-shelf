<script setup lang="ts">
import { toast } from 'vue-sonner'

/**
 * Follow or unfollow an account. The change shows at once and is put back
 * if it fails. Signed-out visitors are sent to sign in.
 */
const props = defineProps<{
  username: string
  following: boolean
  /** They follow the viewer, so Follow reads Follow back. */
  followsYou?: boolean
  size?: 'default' | 'sm'
}>()
const emit = defineEmits<{ 'update:following': [following: boolean] }>()

const { t, locale } = useI18n()
const auth = useAuth()
const follows = useFollows()
const route = useRoute()
const busy = ref(false)

async function toggle() {
  await auth.ensureLoaded()
  if (auth.status.value !== 'signedIn') {
    await navigateTo({ path: '/login', query: { redirect: route.fullPath } })
    return
  }
  const next = !props.following
  busy.value = true
  emit('update:following', next)
  try {
    await (next
      ? follows.follow(props.username)
      : follows.unfollow(props.username))
  } catch (error) {
    emit('update:following', !next)
    const { key, params } = followErrorMessage(error, locale.value)
    toast.error(t(key, params ?? {}))
  } finally {
    busy.value = false
  }
}
</script>

<template>
  <Button
    :variant="following ? 'outline' : 'default'"
    :size="size ?? 'default'"
    :disabled="busy"
    :aria-pressed="following"
    @click="toggle"
  >
    {{
      following
        ? $t('follows.following')
        : followsYou
          ? $t('follows.followBack')
          : $t('follows.follow')
    }}
  </Button>
</template>
