<script setup lang="ts">
import { Monitor } from '@lucide/vue'

const colorMode = useColorMode()

const current = computed(
  () => themes.find((theme) => theme.id === colorMode.preference) ?? themes[0],
)
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Change theme"
        class="text-masthead-foreground hover:bg-masthead-foreground/15 hover:text-masthead-foreground aria-expanded:bg-masthead-foreground/15 aria-expanded:text-masthead-foreground"
      >
        <ClientOnly>
          <component :is="current?.icon" class="size-5" />
          <template #fallback>
            <Monitor class="size-5" />
          </template>
        </ClientOnly>
      </Button>
    </DropdownMenuTrigger>
    <DropdownMenuContent align="end">
      <DropdownMenuLabel>Theme</DropdownMenuLabel>
      <DropdownMenuRadioGroup v-model="colorMode.preference">
        <DropdownMenuRadioItem
          v-for="theme in themes"
          :key="theme.id"
          :value="theme.id"
        >
          <component :is="theme.icon" />
          {{ theme.label }}
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </DropdownMenuContent>
  </DropdownMenu>
</template>
