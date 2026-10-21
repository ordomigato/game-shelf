import { describe, expect, it } from 'vitest'
import { previewHead, previewTags, translate } from './share-previews'

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

describe('previewHead', () => {
  const site = 'https://thisplayshelf.test'
  const preview = {
    title: { key: 'preview.text', params: { text: 'NES Games' } },
    description: { key: 'preview.text', params: { text: 'My NES games' } },
    games: [
      { name: 'Metroid', igdbId: 1 },
      { name: 'Homebrew </script>', igdbId: null },
    ],
  }

  it('adds the canonical link, without a query, and the image details', () => {
    const head = previewHead(preview, '/u/a/shelf/nes/', site).join('\n')
    expect(head).toContain(
      '<link rel="canonical" href="https://thisplayshelf.test/u/a/shelf/nes">',
    )
    expect(head).toContain('<meta property="og:image:width" content="1200">')
    expect(head).toContain('<meta property="og:image:height" content="630">')
    expect(head).toContain(
      '<meta property="og:image:alt" content="The ThisPlayShelf logo',
    )
  })

  it('adds the collection as structured data that cannot break the page', () => {
    const head = previewHead(preview, '/u/a/shelf/nes', site)
    const script = head.find((tag) => tag.startsWith('<script'))!
    expect(script.match(/<\/script>/g)).toHaveLength(1)
    const json = JSON.parse(
      script
        .replace('<script type="application/ld+json">', '')
        .replace('</script>', ''),
    )
    expect(json['@type']).toBe('CollectionPage')
    expect(json.mainEntity.itemListElement[0].url).toBe(`${site}/games/1`)
    expect(json.mainEntity.itemListElement[1].name).toBe('Homebrew </script>')
  })

  it('has no structured data for a shelf', () => {
    const { games: _games, ...shelf } = preview
    expect(
      previewHead(shelf, '/u/a/shelf', site).some((tag) =>
        tag.startsWith('<script'),
      ),
    ).toBe(false)
  })
})
