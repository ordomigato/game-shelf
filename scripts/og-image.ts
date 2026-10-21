/**
 * Draws the site's preview image, public/og.png (1200x630), shown when a
 * link to the site is shared.
 *
 * The mark and the wordmark copy app/components/BrandLogo.vue: the same
 * shelf paths, the same dark theme colours (tailwind.css) and the same
 * fonts (Exo 2 for the wordmark, Outfit for the lines under it, loaded from
 * Google Fonts like the app does). If the logo changes, change it here too.
 *
 * Run it with `npx tsx scripts/og-image.ts` (needs network for the fonts and
 * Playwright's Chromium, `npx playwright install chromium`). Pass another
 * path to write the PNG somewhere else.
 */
import { writeFileSync } from 'node:fs'
import { crc32, deflateSync } from 'node:zlib'
import { chromium } from '@playwright/test'

const out = process.argv[2] ?? 'public/og.png'

const shelves = [
  'M70.7131 82L141.424 122.821L70.7131 163.642L0.00244141 122.821Z',
  'M70.7131 41L141.424 81.8209L70.7131 122.642L0.00244141 81.8209Z',
  'M70.7131 0L141.424 40.8209L70.7131 81.6418L0.00244141 40.8209Z',
]

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
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Exo+2:wght@400;700&family=Outfit:wght@400;500;600&display=swap">
<style>
  :root {
    --logo-wall: #9cc7ea;
    --logo-wall-opacity: 0.55;
    --logo-glass-from: #eaf5ff;
    --logo-glass-via: #79bcef;
    --logo-glass-to: #3c6e93;
    --logo-edge: #ddefff;
  }
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
  /* BrandLogo's wordmark, scaled up. */
  .logo {
    font-family: 'Exo 2', sans-serif;
    font-size: 104px;
    line-height: 1;
    white-space: nowrap;
    color: #f2f7fc;
    margin-bottom: 38px;
  }
  .logo .this {
    margin-right: 0.14em;
    vertical-align: 0.62em;
    font-size: 0.55em;
    font-weight: 400;
    letter-spacing: 0.025em;
    opacity: 0.6;
  }
  .logo .play { font-weight: 700; }
  .tagline { font-size: 38px; font-weight: 600; color: #72bdf4; margin-bottom: 26px; }
  .sub { font-size: 25px; font-weight: 400; color: #a6b0be; }
</style>
</head>
<body>
  <svg viewBox="-6 -6 154 176" aria-hidden="true">
    <defs>
      <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0" style="stop-color: var(--logo-glass-from)" stop-opacity=".95" />
        <stop offset=".55" style="stop-color: var(--logo-glass-via)" stop-opacity=".55" />
        <stop offset="1" style="stop-color: var(--logo-glass-to)" stop-opacity=".7" />
      </linearGradient>
    </defs>
    <g style="fill: var(--logo-wall); fill-opacity: var(--logo-wall-opacity)">
      <path d="M0 41.0009L70.7107 0.190869V41.0109L0 81.8209Z" />
      <path d="M70.7131 122.822L141.424 82.0118V122.832L70.7131 163.642Z" />
    </g>
    ${shelves
      .map(
        (d) =>
          `<path d="${d}" fill="url(#glass)" style="stroke: var(--logo-edge)" stroke-width="2.5" stroke-linejoin="round" stroke-opacity=".9" />`,
      )
      .join('\n    ')}
  </svg>
  <div class="words">
    <div class="logo"><span class="this">this</span><span class="play">PlayShelf</span></div>
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
