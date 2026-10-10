import { describe, expect, it } from 'vitest'
import { previewTags, translate } from './share-previews'

describe('translate', () => {
  it('fills in values', () => {
    expect(
      translate({
        key: 'preview.collectionTitle',
        params: { collection: 'NES Games', owner: 'Retro Fan' },
      }),
    ).toBe("NES Games · Retro Fan's shelf")
  })

  it('picks the plural form by count', () => {
    const games = (count: number) =>
      translate({ key: 'preview.gameCount', params: { count } })
    expect(games(0)).toBe('An empty collection on GameShelf')
    expect(games(1)).toBe('1 game on GameShelf')
    expect(games(12)).toBe('12 games on GameShelf')
  })

  it('returns the key for an unknown message', () => {
    expect(translate({ key: 'nope.missing' })).toBe('nope.missing')
  })
})

describe('previewTags', () => {
  it('escapes what people wrote, so it cannot break out of the tag', () => {
    const tags = previewTags(
      {
        title: {
          key: 'preview.text',
          params: { text: '"><script>x</script>' },
        },
        description: { key: 'preview.text', params: { text: 'Tom & Jerry' } },
      },
      'https://gameshelf.test/u/a/shelf',
    )
    const html = tags.join('\n')
    expect(html).not.toContain('<script>')
    expect(html).toContain(
      '<meta property="og:title" content="&quot;&gt;&lt;script&gt;x&lt;/script&gt;">',
    )
    expect(html).toContain('content="Tom &amp; Jerry"')
  })

  it('adds the image only when there is one', () => {
    const preview = {
      title: { key: 'preview.text', params: { text: 'A' } },
      description: { key: 'preview.text', params: { text: 'B' } },
    }
    expect(previewTags(preview, 'https://x').join()).not.toContain('og:image')
    expect(
      previewTags({ ...preview, image: 'https://img/c.jpg' }, 'https://x'),
    ).toContain('<meta property="og:image" content="https://img/c.jpg">')
  })
})
