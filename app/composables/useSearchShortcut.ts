import { useEventListener } from '@vueuse/core'

/**
 * Pressing `/` anywhere jumps to search: the big box on the home page,
 * otherwise the one in the header. Ignored while typing in a field.
 */
export function useSearchShortcut() {
  if (import.meta.server) return
  useEventListener(window, 'keydown', (event: KeyboardEvent) => {
    if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) {
      return
    }
    const target = event.target as HTMLElement | null
    if (
      target?.isContentEditable ||
      ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName ?? '')
    ) {
      return
    }
    const box = (document.getElementById('game-search') ??
      document.getElementById('header-search')) as HTMLInputElement | null
    if (!box || box.offsetParent === null) return
    event.preventDefault()
    box.focus()
    box.select()
  })
}
