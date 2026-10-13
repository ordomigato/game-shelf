<script setup lang="ts">
import {
  ColorAreaArea,
  ColorAreaRoot,
  ColorAreaThumb,
  ColorFieldInput,
  ColorFieldRoot,
  ColorSliderRoot,
  ColorSliderThumb,
  ColorSliderTrack,
} from 'reka-ui'

/**
 * Picks any colour as a hex code: saturation and brightness in the square,
 * hue on the slider, or the code typed in. Built on reka-ui's colour parts
 * so it matches the rest of the app instead of the browser's own picker.
 */
const colour = defineModel<string>({ required: true })
const hexId = useId()

const thumb =
  'size-4 rounded-full border-2 border-white shadow-md ring-1 ring-black/20 outline-none focus-visible:ring-3 focus-visible:ring-ring'
</script>

<template>
  <div class="flex w-full max-w-64 flex-col gap-3">
    <ColorAreaRoot
      v-slot="{ style }"
      v-model="colour"
      color-space="hsb"
      x-channel="saturation"
      y-channel="brightness"
    >
      <ColorAreaArea
        class="relative h-32 w-full rounded-md border border-border"
        :style="style"
      >
        <ColorAreaThumb :class="thumb" />
      </ColorAreaArea>
    </ColorAreaRoot>
    <ColorSliderRoot
      v-model="colour"
      color-space="hsb"
      channel="hue"
      class="relative flex h-4 w-full touch-none items-center select-none"
    >
      <ColorSliderTrack
        class="relative h-3 w-full grow rounded-full border border-border"
      />
      <ColorSliderThumb :class="thumb" />
    </ColorSliderRoot>
    <div class="flex items-center gap-2">
      <Label :for="hexId" class="text-sm font-normal">
        {{ $t('collections.form.colourHex') }}
      </Label>
      <ColorFieldRoot v-model="colour" class="flex-1">
        <ColorFieldInput
          :id="hexId"
          class="h-8 w-full rounded-md border border-input bg-transparent px-2 font-mono text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
        />
      </ColorFieldRoot>
    </div>
  </div>
</template>
