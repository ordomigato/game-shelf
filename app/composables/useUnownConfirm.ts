/** A question waiting in the dialog, answered through `resolve`. */
interface UnownQuestion {
  name: string
  collections: string[]
  resolve: (confirmed: boolean) => void
}

// Browser only: asked from clicks, never while rendering on the server.
const question = shallowRef<UnownQuestion | null>(null)

/**
 * Asks before taking a game out of Owned while it's in other collections,
 * since it leaves those too. `UnownDialog` (in the layout) shows the
 * question. `confirm` resolves true straight away when there are no other
 * collections, and false when the person cancels.
 */
export function useUnownConfirm() {
  function confirm(name: string, collections: string[]): Promise<boolean> {
    if (!collections.length) return Promise.resolve(true)
    question.value?.resolve(false)
    return new Promise((resolve) => {
      question.value = { name, collections, resolve }
    })
  }

  function answer(confirmed: boolean) {
    const asked = question.value
    question.value = null
    asked?.resolve(confirmed)
  }

  return { question: readonly(question), confirm, answer }
}
