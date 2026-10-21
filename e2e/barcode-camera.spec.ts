import { expect, test } from './fixtures'
import { signInAs } from './support/session'
import { fakeList } from './support/lists'

// A fake camera, so the scanner can start one.
test.use({
  permissions: ['camera'],
  launchOptions: {
    args: [
      '--use-fake-device-for-media-stream',
      '--use-fake-ui-for-media-stream',
    ],
  },
})

test('the decoder loads from this site, and the security policy allows it', async ({
  page,
}) => {
  // Without the browser's own detector, the WebAssembly decoder is used.
  await page.addInitScript(() => {
    delete (globalThis as { BarcodeDetector?: unknown }).BarcodeDetector
  })
  const wasm = page.waitForResponse(
    (response) => response.url().includes('zxing_reader'),
    { timeout: 15_000 },
  )
  await signInAs(page, { username: 'retro_fan' })
  await page.route('**/api/collections', (route) => route.fulfill({ json: [] }))
  await fakeList(page, 'retro_fan', 'owned', [])
  await page.goto('/u/retro_fan/shelf/owned')
  await page.getByRole('button', { name: 'Scan barcodes' }).click()

  const response = await wasm
  expect(new URL(response.url()).origin).toBe(new URL(page.url()).origin)
  expect(response.ok()).toBe(true)
  await expect(page.getByTestId('camera-problem')).toHaveCount(0)
  // Let a few frames go through the decoder.
  await page.waitForTimeout(1500)
  await expect(page.getByTestId('camera-problem')).toHaveCount(0)
})
