<script setup lang="ts">
import { Share2 } from '@lucide/vue'
import { toast } from 'vue-sonner'

/**
 * Shares a page's link: the device's share sheet where there is one (most
 * phones), otherwise a copy to the clipboard. A private collection has to
 * be made public first, so its owner is asked before anything is shared.
 */
const props = defineProps<{
  /** The page's path, like /u/retro_fan/shelf/nes. */
  path: string
  title: string
  isPublic: boolean
  /** Makes the collection public. Resolves false if that failed. */
  makePublic?: () => Promise<boolean>
}>()

const { t } = useI18n()
const asking = ref(false)

async function share() {
  const url = new URL(props.path, window.location.origin).toString()
  if (navigator.share && window.matchMedia('(pointer: coarse)').matches) {
    try {
      await navigator.share({ title: props.title, url })
      return
    } catch (error) {
      // Closing the share sheet isn't a failure.
      if (error instanceof DOMException && error.name === 'AbortError') return
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    toast.success(t('share.copied'))
  } catch {
    toast.error(t('share.copyFailed', { url }))
  }
}

function onClick() {
  if (props.isPublic) void share()
  else asking.value = true
}

async function publishAndShare() {
  asking.value = false
  if (await props.makePublic?.()) await share()
}
</script>

<template>
  <Button variant="outline" @click="onClick">
    <Share2 />
    <span class="hidden sm:inline">{{ $t('share.button') }}</span>
    <span class="sr-only sm:hidden">{{ $t('share.button') }}</span>
  </Button>
  <AlertDialog v-model:open="asking">
    <AlertDialogContent>
      <AlertDialogHeader>
        <AlertDialogTitle>{{ $t('share.makePublicTitle') }}</AlertDialogTitle>
        <AlertDialogDescription>
          {{ $t('share.makePublicBody') }}
        </AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel>{{ $t('collection.cancel') }}</AlertDialogCancel>
        <AlertDialogAction @click="publishAndShare">
          {{ $t('share.makePublicConfirm') }}
        </AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
</template>
