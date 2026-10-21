<script setup lang="ts">
import type { BarcodeReader } from '~/lib/barcode-reader'

/**
 * The phone's camera, reading barcodes from it. The picture stays on the
 * device: only the digits of a barcode are emitted. The camera starts when
 * this mounts and stops when it unmounts or the tab is hidden.
 */
const emit = defineEmits<{
  scan: [value: string]
  /** The camera can't be used: blocked, missing or not supported. */
  unavailable: [reason: 'denied' | 'none']
}>()

/** How often a frame is read, and how long the same code is ignored. */
const READ_EVERY_MS = 200
const REPEAT_AFTER_MS = 2500

const video = ref<HTMLVideoElement>()
const ready = ref(false)
let stream: MediaStream | undefined
let timer: ReturnType<typeof setTimeout> | undefined
let reader: BarcodeReader | undefined
let running = false
let last = { value: '', at: 0 }

function stop() {
  running = false
  clearTimeout(timer)
  stream?.getTracks().forEach((track) => track.stop())
  stream = undefined
  if (video.value) video.value.srcObject = null
  ready.value = false
}

async function readFrame() {
  if (!running || !reader || !video.value) return
  try {
    if (video.value.readyState >= 2) {
      for (const value of await reader(video.value)) {
        const now = Date.now()
        if (value === last.value && now - last.at < REPEAT_AFTER_MS) continue
        last = { value, at: now }
        emit('scan', value)
      }
    }
  } catch {
    // A frame that can't be read is skipped.
  }
  if (running) timer = setTimeout(readFrame, READ_EVERY_MS)
}

async function start() {
  if (running) return
  if (!navigator.mediaDevices?.getUserMedia) {
    emit('unavailable', 'none')
    return
  }
  running = true
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: 'environment' } },
      audio: false,
    })
  } catch (error) {
    running = false
    const denied = (error as { name?: string }).name === 'NotAllowedError'
    emit('unavailable', denied ? 'denied' : 'none')
    return
  }
  if (!running || !video.value) {
    stop()
    return
  }
  video.value.srcObject = stream!
  try {
    await video.value.play()
    reader ??= await (
      await import('~/lib/barcode-reader')
    ).createBarcodeReader()
  } catch {
    stop()
    emit('unavailable', 'none')
    return
  }
  ready.value = true
  void readFrame()
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
