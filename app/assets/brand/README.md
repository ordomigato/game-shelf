# Brand mark

The ThisPlayShelf mark: an S-shaped shelf in isometric (three shelves, a wall
on the left at the top, a wall on the right at the bottom). Every file uses the
same shape. Only the treatment changes. Backgrounds are transparent. Each
treatment has its own folder; the one-ink mark is in `mono/`.

Colours: Steel `#3C6E93`, Sky `#79BCEF`, Amber `#F2B966`, Navy `#041429`,
Paper `#F4F7FA`.

## One ink (printing, stamps, anywhere colour isn't available)

| File                        | Use                        |
| --------------------------- | -------------------------- |
| `mono/shelf-mono-black.svg` | Black on light backgrounds |
| `mono/shelf-mono-white.svg` | White on dark backgrounds  |

## Colour treatments

Each comes as `-light` (for light backgrounds) and `-dark` (for dark ones).

| Treatment                     | Files                                                        |
| ----------------------------- | ------------------------------------------------------------ |
| V1 Steel tones                | `v1-steel-tones/shelf-v1-steel-tones-{light,dark}.svg`       |
| V2 Glass shelves              | `v2-glass-shelves/shelf-v2-glass-shelves-{light,dark}.svg`   |
| V6 Amber middle               | `v6-amber-middle/shelf-v6-amber-middle-{light,dark}.svg`     |
| V8 Amber walls                | `v8-amber-walls/shelf-v8-amber-walls-{light,dark}.svg`       |
| V9 Navy and amber             | `v9-navy-and-amber/shelf-v9-navy-and-amber-{light,dark}.svg` |
| V11 Glass (current favourite) | `v11-glass/shelf-v11-glass-{light,dark}.svg`                 |
| V12 Brushed metal             | `v12-brushed-metal/shelf-v12-brushed-metal-{light,dark}.svg` |

## Single-ink treatments

These use `currentColor`, so they take the text colour when inlined in a page
(as an `<svg>` or a Vue component). Loaded through `<img>` they show black.

| Treatment                    | File                                                                |
| ---------------------------- | ------------------------------------------------------------------- |
| V3 One ink, tints            | `v3-one-ink-tints/shelf-v3-one-ink-tints.svg`                       |
| V4 Line drawing              | `v4-line-drawing/shelf-v4-line-drawing.svg`                         |
| V5 Knockout                  | `v5-knockout/shelf-v5-knockout.svg`                                 |
| V7 Solid shelves, open walls | `v7-solid-shelves-open-walls/shelf-v7-solid-shelves-open-walls.svg` |
| V10 Rounded line             | `v10-rounded-line/shelf-v10-rounded-line.svg`                       |
