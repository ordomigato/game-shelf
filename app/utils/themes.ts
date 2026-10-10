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
  /** i18n key for the theme's name. */
  labelKey: string
  icon: Component
}

export const themes: ThemeOption[] = [
  { id: 'system', labelKey: 'theme.system', icon: Monitor },
  { id: 'light', labelKey: 'theme.light', icon: Sun },
  { id: 'dark', labelKey: 'theme.dark', icon: Moon },
]
