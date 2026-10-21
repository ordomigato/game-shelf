import { describe, expect, it } from 'vitest'
import { previewTags, translate } from './share-previews'

describe('translate', () => {
  it('fills in values', () => {
    expect(
      translate({
        key: 'preview.collectionTitle',
        params: { collection: 'NES Games', owner: 'Retro Fan' },
      }),
    ).toBe("NES Games · Retro Fan's collections")
  })

  it('picks the plural form by count', () => {
    const games = (count: number) =>
      translate({ key: 'preview.gameCount', params: { count } })
    expect(games(0)).toBe('An empty collection on ThisPlayShelf')
    expect(games(1)).toBe('1 game on ThisPlayShelf')
    expect(games(12)).toBe('12 games on ThisPlayShelf')
  })

  it('names the lists for their previews', () => {
    expect(translate({ key: 'shelf.owned' })).toBe('Owned')
    expect(translate({ key: 'shelf.wishlist' })).toBe('Wishlist')
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
      'https://thisplayshelf.test/u/a/shelf',
      'https://thisplayshelf.test',
    )
    const html = tags.join('\n')
    expect(html).not.toContain('<script>')
    expect(html).toContain(
      '<meta property="og:title" content="&quot;&gt;&lt;script&gt;x&lt;/script&gt;">',
    )
    expect(html).toContain('content="Tom &amp; Jerry"')
  })

  it('uses the collection cover, or the site image when there is none', () => {
    const preview = {
      title: { key: 'preview.text', params: { text: 'A' } },
      description: { key: 'preview.text', params: { text: 'B' } },
    }
    const site = 'https://thisplayshelf.test'
    const plain = previewTags(preview, `${site}/u/a/shelf`, site)
    expect(plain).toContain(
      '<meta property="og:image" content="https://thisplayshelf.test/og.png">',
    )
    expect(plain).toContain(
      '<meta name="twitter:card" content="summary_large_image">',
    )
    const covered = previewTags(
      { ...preview, image: 'https://img/c.jpg' },
      `${site}/u/a/shelf`,
      site,
    )
    expect(covered).toContain(
      '<meta property="og:image" content="https://img/c.jpg">',
    )
    expect(covered).toContain('<meta name="twitter:card" content="summary">')
  })
})
