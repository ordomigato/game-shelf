import { readFileSync } from 'node:fs'
import opentype from 'opentype.js'
import { describe, expect, it } from 'vitest'

const read = (path: string) =>
  readFileSync(new URL(`../../../${path}`, import.meta.url), 'utf8')

type Box = { x1: number; y1: number; x2: number; y2: number }

/** The bounding box of an absolute SVG path (M L H V Q C Z), as drawn. */
function pathBox(d: string): Box {
  const path = new opentype.Path()
  let [x, y] = [0, 0]
  for (const [, cmd, args] of d.matchAll(/([MLHVQCZ])([^MLHVQCZ]*)/g)) {
    const n = (args!.match(/-?\d*\.?\d+(?:e-?\d+)?/g) ?? []).map(
      Number,
    ) as number[]
    // The pen's end point is the last pair of numbers.
    if (cmd === 'H') x = n[0]!
    else if (cmd === 'V') y = n[0]!
    else if (cmd !== 'Z') [x, y] = [n.at(-2)!, n.at(-1)!]
    if (cmd === 'M') path.moveTo(x, y)
    else if (cmd === 'L' || cmd === 'H' || cmd === 'V') path.lineTo(x, y)
    else if (cmd === 'Q') path.quadraticCurveTo(n[0]!, n[1]!, x, y)
    else if (cmd === 'C') path.curveTo(n[0]!, n[1]!, n[2]!, n[3]!, x, y)
    else path.close()
  }
  return path.getBoundingBox()
}

/** Every path's box in an SVG file, with its `translate() scale()` applied. */
function drawnBoxes(svg: string): Box[] {
  const boxes: Box[] = []
  const walk =
    /<g transform="translate\(([-\d. ]+)\) scale\(([\d.]+)\)">|<path[^>]* d="([^"]+)"/g
  let t = { dx: 0, dy: 0, s: 1 }
  for (const m of svg.matchAll(walk)) {
    if (m[1]) {
      const [dx, dy] = m[1].split(' ').map(Number)
      t = { dx: dx!, dy: dy!, s: Number(m[2]) }
    } else if (m[3]) {
      // The mark comes before the wordmark's transformed group.
      const b = pathBox(m[3])
      const inGroup = t.s !== 1
      boxes.push(
        inGroup
          ? {
              x1: b.x1 * t.s + t.dx,
              y1: b.y1 * t.s + t.dy,
              x2: b.x2 * t.s + t.dx,
              y2: b.y2 * t.s + t.dy,
            }
          : b,
      )
    }
  }
  return boxes
}

// The text is outlined from the font, and its "y" tail and the raised "this"
// reach outside a line of text. This fails when an output's viewBox clips any
// path (the mark's strokes are inside its padding, so they are not counted).
describe('generated logo files', () => {
  const files = [
    'public/brand/mark-light.svg',
    'public/brand/mark-dark.svg',
    'public/brand/wordmark-light.svg',
    'public/brand/wordmark-dark.svg',
    'public/brand/logo-light.svg',
    'public/brand/logo-dark.svg',
    'public/favicon.svg',
  ]
  it.each(files)('%s shows every path whole', (file) => {
    const svg = read(file)
    const [x, y, w, h] = svg
      .match(/viewBox="([^"]+)"/)![1]!
      .split(' ')
      .map(Number) as [number, number, number, number]
    const boxes = drawnBoxes(svg)
    expect(boxes.length).toBeGreaterThan(0)
    for (const b of boxes) {
      expect(b.x1).toBeGreaterThanOrEqual(x)
      expect(b.y1).toBeGreaterThanOrEqual(y)
      expect(b.x2).toBeLessThanOrEqual(x + w)
      expect(b.y2).toBeLessThanOrEqual(y + h)
    }
  })

  it('the wordmark box in logo-paths.ts matches the wordmark svg', () => {
    const ts = read('app/assets/brand/logo-paths.ts')
    const svg = read('public/brand/wordmark-dark.svg')
    const viewBox = ts.match(/wordmarkViewBox = '([^']+)'/)![1]
    expect(svg).toContain(`viewBox="${viewBox}"`)
  })
})
