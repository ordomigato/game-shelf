<script setup lang="ts">
import type { BarcodeReader } from '~/lib/barcode-reader'

/**
 * The phone's camera, reading barcodes from it. The picture stays on the
 * device: only the digits of a barcode are emitted. The camera starts when
 * this mounts and stops when it unmounts or the tab is hidden.
 */
const emit = defineEmits<{
  scan: [value: string, format: string]
  /** The camera can't be used: blocked, missing or not supported. */
  unavailable: [reason: 'denied' | 'none']
}>()
const props = defineProps<{
  /** Frames are not read while this is true (a question is open). */
  paused?: boolean
}>()

/** How often a frame is read, and how long the same code is ignored. */
const READ_EVERY_MS = 200
const REPEAT_AFTER_MS = 2500

const video = ref<HTMLVideoElement>()
const ready = ref(false)
let stream: MediaStream | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let reader: BarcodeReader | undefined
// Each start gets a number. Stopping or starting again makes older ones
// stale, and a stale start gives back anything it received after its
// awaits, so there is never more than one stream and the camera light
// goes off.
let token = 0
let last = { value: '', at: 0 }

function release(received: MediaStream | undefined) {
  received?.getTracks().forEach((track) => track.stop())
}

function stop() {
  token += 1
  clearTimeout(timer)
  release(stream)
  stream = undefined
  if (video.value) video.value.srcObject = null
  ready.value = false
}

async function readFrame(mine: number) {
  if (mine !== token || !reader || !video.value) return
  try {
    if (!props.paused && video.value.readyState >= 2) {
      for (const { value, format } of await reader(video.value)) {
        if (mine !== token || props.paused) break
        const now = Date.now()
        if (value === last.value && now - last.at < REPEAT_AFTER_MS) continue
        last = { value, at: now }
        emit('scan', value, format)
      }
    }
  } catch {
    // A frame that can't be read is skipped.
  }
  if (mine === token) timer = setTimeout(() => readFrame(mine), READ_EVERY_MS)
}

async function start() {
  stop()
  const mine = token
  if (!navigator.mediaDevices?.getUserMedia) {
    emit('unavailable', 'none')
    return
  }
  let received: MediaStream
  try {
    received = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })
  } catch (error) {
    if (mine !== token) return
    const denied = (error as { name?: string }).name === 'NotAllowedError'
    emit('unavailable', denied ? 'denied' : 'none')
    return
  }
  if (mine !== token || !video.value) {
    release(received)
    return
  }
  stream = received
  video.value.srcObject = received
  try {
    await video.value.play()
    if (mine !== token) return
    reader ??= await (
      await import('~/lib/barcode-reader')
    ).createBarcodeReader()
  } catch (error) {
    // Play is interrupted when the video is reset: a cancel, not a failure.
    if (mine !== token || (error as { name?: string }).name === 'AbortError') {
      return
    }
    stop()
    emit('unavailable', 'none')
    return
  }
  if (mine !== token) return
  ready.value = true
  void readFrame(mine)
}

function onVisibility() {
  if (document.hidden) stop()
  else void start()
}

onMounted(() => {
  document.addEventListener('visibilitychange', onVisibility)
  void start()
})
onBeforeUnmount(() => {
  document.removeEventListener('visibilitychange', onVisibility)
  stop()
})
</script>

<template>
  <div
    class="relative aspect-[4/3] max-h-56 w-full overflow-hidden rounded-lg bg-muted"
    data-testid="scanner-camera"
  >
    <video
      ref="video"
      class="size-full object-cover"
      playsinline
      muted
      :aria-label="$t('scan.cameraLabel')"
    />
    <p
      v-if="!ready"
      class="absolute inset-0 flex items-center justify-center p-4 text-center text-sm text-muted-foreground"
    >
      {{ $t('scan.cameraStarting') }}
    </p>
  </div>
</template>
