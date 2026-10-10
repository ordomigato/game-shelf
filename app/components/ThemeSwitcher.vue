<script setup lang="ts">
import { Settings } from '@lucide/vue'

const colorMode = useColorMode()
</script>

<template>
  <DropdownMenu>
    <DropdownMenuTrigger as-child>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Settings"
        class="text-masthead-foreground hover:bg-masthead-foreground/15 hover:text-masthead-foreground aria-expanded:bg-masthead-foreground/15 aria-expanded:text-masthead-foreground"
      >
        <Settings class="size-5" />
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
