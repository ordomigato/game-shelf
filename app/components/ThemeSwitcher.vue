<script setup lang="ts">
withDefaults(
  defineProps<{
    /** Show each theme's name next to its icon. */
    showLabels?: boolean
  }>(),
  { showLabels: false },
)

const colorMode = useColorMode()

// A single toggle group clears its value when the active item is clicked
// again. Ignore that so one theme is always chosen.
function choose(value: unknown) {
  if (typeof value === 'string' && value) colorMode.preference = value
}
</script>

<template>
  <!-- The saved theme is only known in the browser. -->
  <ClientOnly>
    <ToggleGroup
      type="single"
      variant="outline"
      size="sm"
      :model-value="colorMode.preference"
      :aria-label="$t('theme.label')"
      @update:model-value="choose"
    >
      <ToggleGroupItem
        v-for="theme in themes"
        :key="theme.id"
        :value="theme.id"
        :aria-label="$t(theme.labelKey)"
        :title="showLabels ? undefined : $t(theme.labelKey)"
        class="data-[state=on]:bg-primary/15 data-[state=on]:text-primary"
      >
        <component :is="theme.icon" aria-hidden="true" />
        <span v-if="showLabels">{{ $t(theme.labelKey) }}</span>
      </ToggleGroupItem>
    </ToggleGroup>
  </ClientOnly>
</template>
