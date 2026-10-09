import type { Component } from 'vue'
import { Monitor, Moon, Sun } from '@lucide/vue'

/**
 * Themes offered in the theme switcher. `id` is the color-mode preference,
 * which becomes a class on `<html>`. `light` and `dark` map to the `:root`
 * and `.dark` variables in `assets/css/tailwind.css`. `system` follows the
 * operating system.
 */
export interface ThemeOption {
  id: string
  label: string
  icon: Component
}

export const themes: ThemeOption[] = [
  { id: 'system', label: 'System', icon: Monitor },
  { id: 'light', label: 'Light', icon: Sun },
  { id: 'dark', label: 'Dark', icon: Moon },
]
