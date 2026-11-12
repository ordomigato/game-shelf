<script setup lang="ts">
import { Ellipsis } from '@lucide/vue'
import { toast } from 'vue-sonner'

/**
 * The "…" menu for another account: remove them as a follower, block them,
 * or unblock them. Blocking asks first. The parent updates what it shows
 * from the events.
 */
const props = defineProps<{
  username: string
  /** They follow the viewer, so they can be removed. */
  canRemove: boolean
  /** The viewer has already blocked them. */
  blocking: boolean
}>()
const emit = defineEmits<{
  removed: []
  blocked: []
  unblocked: []
}>()

const { t, locale } = useI18n()
const follows = useFollows()
const confirming = ref(false)
const busy = ref(false)

async function run(action: () => Promise<unknown>, done: () => void) {
  busy.value = true
  try {
    await action()
    done()
  } catch (error) {
    const { key, params } = followErrorMessage(error, locale.value)
    toast.error(t(key, params ?? {}))
  } finally {
    busy.value = false
  }
}

const remove = () =>
  run(
    () => follows.removeFollower(props.username),
    () => emit('removed'),
  )
const block = () =>
  run(
    () => follows.block(props.username),
    () => {
      confirming.value = false
      emit('blocked')
    },
  )
const unblock = () =>
  run(
    () => follows.unblock(props.username),
    () => emit('unblocked'),
  )
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="outline"
        size="icon"
        :disabled="busy"
        :aria-label="$t('follows.accountActions', { username })"
      >
        <Ellipsis />
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end" class="w-max">
      <DropdownMenuItem v-if="canRemove" @select="remove">
        {{ $t('follows.removeFollower') }}
      </DropdownMenuItem>
      <DropdownMenuItem v-if="blocking" @select="unblock">
        {{ $t('follows.unblock') }}
      </DropdownMenuItem>
      <DropdownMenuItem v-else @select="confirming = true">
        {{ $t('follows.block') }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenu>

  <AlertDialog v-model:open="confirming">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{
          $t('follows.blockTitle', { username })
        }}</AlertDialogTitle>
        <AlertDialogDescription>{{
          $t('follows.blockBody')
        }}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ $t('follows.cancel') }}</AlertDialogCancel>
        <AlertDialogAction
          class="bg-destructive text-white hover:bg-destructive/90"
          :disabled="busy"
          @click.prevent="block"
        >
          {{ $t('follows.block') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
