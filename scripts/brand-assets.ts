/**
 * Builds every copy of the ThisPlayShelf logo from one definition, so they
 * cannot drift. Outputs:
 *
 *   public/brand/mark-{light,dark}.svg      the S-shaped glass shelf alone
 *   public/brand/wordmark-{light,dark}.svg  "this" + "PlayShelf" alone
 *   public/brand/logo-{light,dark}.svg      mark and wordmark together
 *   public/favicon.svg                      the mark, switching theme by itself
 *   public/email-logo.png                   logo-dark.svg for the emails
 *   app/assets/brand/logo-paths.ts          the same paths, for BrandLogo.vue
 *
 * "light" is for light backgrounds, "dark" for dark backgrounds. The text is
 * outlined from the Exo 2 font files in scripts/fonts (SIL Open Font
 * License, from Google Fonts), so no font is needed to draw any of them.
 * scripts/og-image.ts reads the mark and wordmark SVGs for public/og.png.
 *
 * Run it with `npx tsx scripts/brand-assets.ts` (the PNG needs Playwright's
 * Chromium, `npx playwright install chromium`), then `npx tsx
 * scripts/og-image.ts`. Colours must match the --logo-* variables and the
 * foreground colours in app/assets/css/tailwind.css (a unit test checks the
 * --logo-* ones).
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium } from '@playwright/test'
import opentype from 'opentype.js'

/** The mark's drawing area: the S is 142 x 164 units, plus room for strokes. */
const MARK_VIEWBOX = { x: -6, y: -6, w: 154, h: 176 }

const WALLS = [
  'M0 41.0009L70.7107 0.190869V41.0109L0 81.8209Z',
  'M70.7131 122.822L141.424 82.0118V122.832L70.7131 163.642Z',
]
const SHELVES = [
  'M70.7131 82L141.424 122.821L70.7131 163.642L0.00244141 122.821Z',
  'M70.7131 41L141.424 81.8209L70.7131 122.642L0.00244141 81.8209Z',
  'M70.7131 0L141.424 40.8209L70.7131 81.6418L0.00244141 40.8209Z',
]

/** Colours per background. `text` is the page's foreground colour. */
const THEMES = {
  light: {
    wall: '#1e4363',
    wallOpacity: 0.85,
    glassFrom: '#cfe6f8',
    glassVia: '#79bcef',
    glassTo: '#3c6e93',
    edge: '#ffffff',
    text: '#0f1e33',
  },
  dark: {
    wall: '#9cc7ea',
    wallOpacity: 0.55,
    glassFrom: '#eaf5ff',
    glassVia: '#79bcef',
    glassTo: '#3c6e93',
    edge: '#ddefff',
    text: '#e9eff5',
  },
}
type Theme = keyof typeof THEMES

/** The wordmark's shape, in em of the main text. */
const THIS = {
  size: 0.55, // "this" is 55% as big as "PlayShelf"
  tracking: 0.025, // letter spacing, in em of "this"
  gap: 0.14, // space after it, in em of "this"
  raise: 0.62, // lifted off the baseline by this many em of "this"
  opacity: 0.6,
}

/** How the app lays the logo out: the mark is 28px tall, the text 20px. */
const APP = { markPx: 28, textPx: 20, gapPx: 8 }

const fontBuffer = (file: string) => {
  const b = readFileSync(new URL(`./fonts/${file}`, import.meta.url))
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)
}
const regular = opentype.parse(fontBuffer('Exo2-Regular.ttf'))
const bold = opentype.parse(fontBuffer('Exo2-Bold.ttf'))

/** A string array as Prettier prints it. */
const list = (items: string[]) =>
  `[\n${items.map((d) => `  '${d}',\n`).join('')}]`

const round = (n: number) => Math.round(n * 100) / 100

/** Space kept around the wordmark's real outline, in em/100 units. */
const WORD_PAD = 2

/**
 * The wordmark outlined in a line box 1em tall (100 units), like a line of
 * text with `line-height: 1`; the baseline and sizes come from the font's
 * metrics. `box` is what the SVGs show: the outlines' real bounding box (the
 * "y" tail and the raised "this" reach outside the line box) plus even
 * padding, in the line box's coordinates.
 */
function wordmark() {
  const em = 100
  const { ascender, descender, unitsPerEm } = bold
  const asc = (ascender / unitsPerEm) * em
  const desc = (-descender / unitsPerEm) * em
  // Chrome centres the font's ascent + descent inside the line box.
  const baseline = (em - (asc + desc)) / 2 + asc

  const thisSize = em * THIS.size
  const opts = { kerning: true, letterSpacing: THIS.tracking }
  const thisWidth = regular.getAdvanceWidth('this', thisSize, opts)
  const thisPath = regular.getPath(
    'this',
    0,
    baseline - THIS.raise * thisSize,
    thisSize,
    opts,
  )
  const playX = thisWidth + THIS.gap * thisSize
  const playPath = bold.getPath('PlayShelf', playX, baseline, em, {
    kerning: true,
  })
  const width = playX + bold.getAdvanceWidth('PlayShelf', em, { kerning: true })
  const [a, b] = [thisPath.getBoundingBox(), playPath.getBoundingBox()]
  const x1 = Math.floor(Math.min(a.x1, b.x1)) - WORD_PAD
  const y1 = Math.floor(Math.min(a.y1, b.y1)) - WORD_PAD
  const x2 = Math.ceil(Math.max(a.x2, b.x2)) + WORD_PAD
  const y2 = Math.ceil(Math.max(a.y2, b.y2)) + WORD_PAD
  return {
    width: round(width),
    height: em,
    box: { x: x1, y: y1, w: x2 - x1, h: y2 - y1 },
    thisD: thisPath.toPathData(2),
    playD: playPath.toPathData(2),
  }
}
const word = wordmark()

const markGradient = (id: string, t: (typeof THEMES)[Theme]) =>
  `<linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${t.glassFrom}" stop-opacity=".95"/><stop offset=".55" stop-color="${t.glassVia}" stop-opacity=".55"/><stop offset="1" stop-color="${t.glassTo}" stop-opacity=".7"/></linearGradient>`

const markShapes = (id: string, t: (typeof THEMES)[Theme]) =>
  `<g fill="${t.wall}" fill-opacity="${t.wallOpacity}">${WALLS.map((d) => `<path d="${d}"/>`).join('')}</g>` +
  `<g fill="url(#${id})" stroke="${t.edge}" stroke-width="2.5" stroke-linejoin="round" stroke-opacity=".9">${SHELVES.map((d) => `<path d="${d}"/>`).join('')}</g>`

const wordShapes = (t: (typeof THEMES)[Theme]) =>
  `<g fill="${t.text}"><path fill-opacity="${THIS.opacity}" d="${word.thisD}"/><path d="${word.playD}"/></g>`

const svg = (viewBox: string, label: string, inner: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" role="img" aria-label="${label}">${inner}</svg>\n`

const wb = word.box
const wordBox = `${wb.x} ${wb.y} ${wb.w} ${wb.h}`
const m = MARK_VIEWBOX
const markBox = `${m.x} ${m.y} ${m.w} ${m.h}`

// The logo is the mark and the wordmark side by side, sized and spaced like
// BrandLogo in the app: the text box is centred on the mark's middle.
const unitsPerPx = m.h / APP.markPx
const textScale = (APP.textPx * unitsPerPx) / word.height
const textX = m.x + m.w + APP.gapPx * unitsPerPx
const textY = m.y + m.h / 2 - (word.height * textScale) / 2
// The box is the mark's and the wordmark's outlines together, with the
// mark's own padding (6 units) kept around the wordmark too.
const wordTop = textY + wb.y * textScale
const wordBottom = textY + (wb.y + wb.h) * textScale
const pad = -m.x
const logoY = Math.floor(Math.min(m.y, wordTop - pad))
const logoBottom = Math.ceil(Math.max(m.y + m.h, wordBottom + pad))
const logoRight = textX + (wb.x + wb.w) * textScale + pad
const logoBox = `${m.x} ${logoY} ${round(logoRight - m.x)} ${logoBottom - logoY}`
const logoWordTransform = `translate(${round(textX)} ${round(textY)}) scale(${round(textScale * 1e4) / 1e4})`

const files = new Map<string, string>()
for (const theme of ['light', 'dark'] as const) {
  const t = THEMES[theme]
  files.set(
    `public/brand/mark-${theme}.svg`,
    svg(
      markBox,
      'ThisPlayShelf',
      `<defs>${markGradient('g', t)}</defs>${markShapes('g', t)}`,
    ),
  )
  files.set(
    `public/brand/wordmark-${theme}.svg`,
    svg(wordBox, 'ThisPlayShelf', wordShapes(t)),
  )
  files.set(
    `public/brand/logo-${theme}.svg`,
    svg(
      logoBox,
      'ThisPlayShelf',
      `<defs>${markGradient('g', t)}</defs>${markShapes('g', t)}<g transform="${logoWordTransform}">${wordShapes(t)}</g>`,
    ),
  )
}

// The favicon is the mark, with the dark colours when the browser is dark.
const { light, dark } = THEMES
files.set(
  'public/favicon.svg',
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${markBox}"><style>.a{stop-color:${light.glassFrom}}.w{fill:${light.wall};fill-opacity:${light.wallOpacity}}.s{stroke:${light.edge}}@media (prefers-color-scheme:dark){.a{stop-color:${dark.glassFrom}}.w{fill:${dark.wall};fill-opacity:${dark.wallOpacity}}.s{stroke:${dark.edge}}}</style><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop class="a" offset="0" stop-opacity=".95"/><stop offset=".55" stop-color="${light.glassVia}" stop-opacity=".55"/><stop offset="1" stop-color="${light.glassTo}" stop-opacity=".7"/></linearGradient></defs>${WALLS.map((d) => `<path class="w" d="${d}"/>`).join('')}<g class="s" fill="url(#g)" stroke-width="2.5" stroke-linejoin="round" stroke-opacity=".9">${SHELVES.map((d) => `<path d="${d}"/>`).join('')}</g></svg>\n`,
)

// The same shapes for BrandLogo.vue, which fills them from the theme's CSS
// variables instead of the colours above.
files.set(
  'app/assets/brand/logo-paths.ts',
  `// Generated by scripts/brand-assets.ts from the logo's one definition. Do
// not edit by hand: run \`npx tsx scripts/brand-assets.ts\`.

export const markViewBox = '${markBox}'
export const markWalls = ${list(WALLS)}
export const markShelves = ${list(SHELVES)}

/**
 * The wordmark's SVG box, with room for the "y" tail. Its coordinates are
 * those of a line of text 100 units tall (the font size, line-height 1), so
 * scale by the font size / 100 and shift by \`y\` to line it up as text.
 */
export const wordmarkViewBox = '${wordBox}'
export const wordmarkBox = { x: ${wb.x}, y: ${wb.y}, w: ${wb.w}, h: ${wb.h} }
/** The text's own width (its advance), inside that box. */
export const wordmarkWidth = ${word.width}
export const wordmarkThis = '${word.thisD}'
export const wordmarkThisOpacity = ${THIS.opacity}
export const wordmarkPlay = '${word.playD}'
`,
)

mkdirSync('public/brand', { recursive: true })
for (const [path, content] of files) writeFileSync(path, content)
// Long strings move to their own line, as the project's formatter wants.
execFileSync('npx', ['prettier', '--write', 'app/assets/brand/logo-paths.ts'])

// Email clients don't show SVG. The emails' header band is dark navy
// (infra/emails/code.html), so the dark logo goes on a transparent PNG:
// it reads on the navy, and on whatever dark colour a dark-mode client
// swaps in. Twice the size it's shown at (240 x 56), for sharp screens.
const [pngW, pngH, padX, padY] = [480, 112, 24, 16]
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: pngW, height: pngH } })
await page.setContent(
  `<body style="margin:0;background:transparent">` +
    files
      .get('public/brand/logo-dark.svg')!
      .replace(
        '<svg ',
        `<svg style="position:absolute;left:${padX}px;top:${padY}px;height:${pngH - 2 * padY}px" `,
      ) +
    `</body>`,
)
writeFileSync(
  'public/email-logo.png',
  await page.screenshot({ type: 'png', omitBackground: true }),
)
await browser.close()
