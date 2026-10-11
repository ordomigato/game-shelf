/**
 * Saves a file the app fetched (an export, say) to the person's device.
 * Exports need the access token, so they're fetched first rather than
 * linked to directly.
 */
export function saveFile(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.append(link)
  link.click()
  link.remove()
  // Give the browser a moment to start the download before letting go.
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}
