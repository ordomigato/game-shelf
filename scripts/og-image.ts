/**
 * Draws the site's preview image, public/og.png (1200x630), shown when a
 * link to the site is shared.
 *
 * The mark and the wordmark are the dark-background files in public/brand
 * (made by scripts/brand-assets.ts, run that first if the logo changed), put
 * in the page as they are. The lines under them use Outfit, loaded from
 * Google Fonts like the app does.
 *
 * Run it with `npx tsx scripts/og-image.ts` (needs network for the font and
 * Playwright's Chromium, `npx playwright install chromium`). Pass another
 * path to write the PNG somewhere else.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'
import { chromium } from '@playwright/test'

const out = process.argv[2] ?? 'public/og.png'

const brand = (file: string) =>
  readFileSync(new URL(`../public/brand/${file}`, import.meta.url), 'utf8')

/**
 * The background, a diagonal gradient as a PNG data URL. Chrome dithers CSS
 * and canvas gradients, which makes the screenshot three times bigger, so the
 * steps are rounded here instead. They are less than a shade apart.
 */
function gradient(): string {
  const [w, h] = [1200, 630]
  const stops: [number, number[]][] = [
    [0, [12, 35, 66]],
    [0.5, [5, 22, 48]],
    [1, [2, 11, 28]],
  ]
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      // Position along the diagonal, 0 to 1.
      const t = (x * w + y * h) / (w * w + h * h)
      const i = t < 0.5 ? 0 : 1
      const f = (t - stops[i]![0]) / (stops[i + 1]![0] - stops[i]![0])
      for (let c = 0; c < 3; c++) {
        const [from, to] = [stops[i]![1][c]!, stops[i + 1]![1][c]!]
        raw[y * (w * 3 + 1) + 1 + x * 3 + c] = Math.round(
          from + (to - from) * f,
        )
      }
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type), data])
    const length = Buffer.alloc(4)
    length.writeUInt32BE(data.length)
    const crc = Buffer.alloc(4)
    crc.writeUInt32BE(crc32(body))
    return Buffer.concat([length, body, crc])
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(w, 0)
  header.writeUInt32BE(h, 4)
  header.set([8, 2, 0, 0, 0], 8) // 8-bit RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
  return `data:image/png;base64,${png.toString('base64')}`
}

const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;500;600&display=swap">
<style>
  * { margin: 0; box-sizing: border-box; }
  body {
    width: 1200px;
    height: 630px;
    display: flex;
    align-items: center;
    gap: 62px;
    padding-left: 100px;
    background: #051630 url(${gradient()}) no-repeat;
    font-family: 'Outfit', sans-serif;
  }
  svg { height: 365px; width: auto; flex: none; }
  .words { display: flex; flex-direction: column; }
  /* The wordmark's box is one em tall, so its height is the text size. */
  .logo { height: 104px; margin-bottom: 38px; }
  .logo svg { height: 104px; }
  .tagline { font-size: 38px; font-weight: 600; color: #72bdf4; margin-bottom: 26px; }
  .sub { font-size: 25px; font-weight: 400; color: #a6b0be; }
</style>
</head>
<body>
  ${brand('mark-dark.svg')}
  <div class="words">
    <div class="logo">${brand('wordmark-dark.svg')}</div>
    <div class="tagline">Your collection, on display.</div>
    <div class="sub">Search games, track your collection and share your shelf.</div>
  </div>
</body>
</html>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } })
await page.setContent(html, { waitUntil: 'networkidle' })
await page.evaluate(() => document.fonts.ready)
writeFileSync(out, await page.screenshot({ type: 'png' }))
await browser.close()
