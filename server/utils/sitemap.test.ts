import { describe, expect, it } from 'vitest'
import {
  chunkEntries,
  indexXml,
  sitemapEntries,
  urlsetXml,
  type SitemapData,
} from './sitemap'

const data: SitemapData = {
  gameIds: [1026, 7346],
  users: [
    {
      username: 'retro_fan',
      ownedPublic: true,
      wishlistPublic: false,
      hasOwned: true,
      hasWishlist: true,
    },
    {
      // Both lists private: nothing of theirs is listed.
      username: 'private_pat',
      ownedPublic: false,
      wishlistPublic: false,
      hasOwned: true,
      hasWishlist: true,
    },
    {
      // A public list with no games on it is a thin page.
      username: 'empty_ed',
      ownedPublic: true,
      wishlistPublic: true,
      hasOwned: false,
      hasWishlist: false,
    },
  ],
  collections: [
    {
      username: 'retro_fan',
      slug: 'nes-games',
      visibility: 'public',
      itemCount: 12,
      lastmod: new Date('2026-10-01T12:00:00Z'),
    },
    {
      username: 'retro_fan',
      slug: 'secret',
      visibility: 'private',
      itemCount: 3,
      lastmod: null,
    },
    {
      username: 'retro_fan',
      slug: 'empty',
      visibility: 'public',
      itemCount: 0,
      lastmod: null,
    },
    {
      username: 'private_pat',
      slug: 'hidden',
      visibility: 'private',
      itemCount: 9,
      lastmod: null,
    },
  ],
}

const paths = () => sitemapEntries(data).map((entry) => entry.path)

describe('sitemapEntries', () => {
  it('lists the fixed pages and every game', () => {
    expect(paths()).toEqual(
      expect.arrayContaining([
        '/',
        '/explore',
        '/about',
        '/pricing',
        '/privacy',
        '/contact',
        '/games/1026',
        '/games/7346',
      ]),
    )
  })

  it('lists only what is public, with the shelf it is on', () => {
    expect(paths().filter((path) => path.startsWith('/u/'))).toEqual([
      '/u/retro_fan/shelf',
      '/u/retro_fan/shelf/owned',
      '/u/retro_fan/shelf/nes-games',
    ])
  })

  it('never lists a private collection, a private list or a private user', () => {
    const all = paths().join('\n')
    expect(all).not.toContain('secret')
    expect(all).not.toContain('private_pat')
    expect(all).not.toContain('hidden')
    expect(all).not.toContain('/wishlist')
    expect(all).not.toContain('empty')
  })

  it('gives a date only where there is a real one', () => {
    const entries = sitemapEntries(data)
    const byPath = (path: string) => entries.find((e) => e.path === path)
    expect(byPath('/u/retro_fan/shelf/nes-games')?.lastmod).toEqual(
      new Date('2026-10-01T12:00:00Z'),
    )
    expect(byPath('/u/retro_fan/shelf')?.lastmod).toEqual(
      new Date('2026-10-01T12:00:00Z'),
    )
    expect(byPath('/games/1026')?.lastmod).toBeUndefined()
    expect(byPath('/about')?.lastmod).toBeUndefined()
  })

  it('writes names that need it as safe addresses', () => {
    const list = sitemapEntries({
      ...data,
      users: [],
      collections: [
        {
          username: 'retro_fan',
          slug: 'a&b c',
          visibility: 'public',
          itemCount: 1,
          lastmod: null,
        },
      ],
    })
    expect(list.map((entry) => entry.path)).toContain(
      '/u/retro_fan/shelf/a%26b%20c',
    )
  })
})

describe('urlsetXml', () => {
  it('is a sitemap with absolute addresses', () => {
    const xml = urlsetXml(
      [
        { path: '/' },
        { path: '/u/a/shelf/x&y', lastmod: new Date('2026-10-01T12:00:00Z') },
      ],
      'https://thisplayshelf.com',
    )
    expect(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>')).toBe(true)
    expect(xml).toContain(
      '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    )
    expect(xml).toContain('<url><loc>https://thisplayshelf.com/</loc></url>')
    expect(xml).toContain(
      '<loc>https://thisplayshelf.com/u/a/shelf/x&amp;y</loc><lastmod>2026-10-01T12:00:00.000Z</lastmod>',
    )
  })
})

describe('chunkEntries', () => {
  const many = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ path: `/games/${i}` }))

  it('keeps one file while it fits', () => {
    expect(chunkEntries(many(5), 5)).toHaveLength(1)
    expect(chunkEntries([])).toEqual([[]])
  })

  it('splits past the limit, in order', () => {
    const chunks = chunkEntries(many(11), 5)
    expect(chunks.map((chunk) => chunk.length)).toEqual([5, 5, 1])
    expect(chunks[2]![0]!.path).toBe('/games/10')
  })
})

describe('indexXml', () => {
  it('points to each file', () => {
    expect(indexXml(['https://thisplayshelf.com/sitemaps/1.xml'])).toContain(
      '<sitemap><loc>https://thisplayshelf.com/sitemaps/1.xml</loc></sitemap>',
    )
  })
})
