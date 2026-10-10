import { describe, expect, it } from 'vitest'
import {
  collectionPreview,
  parseSharePath,
  shelfPreview,
} from './share-preview'

describe('parseSharePath', () => {
  it('finds shelves and collections', () => {
    expect(parseSharePath('/u/Retro_Fan/shelf')).toEqual({
      username: 'retro_fan',
    })
    expect(parseSharePath('/u/retro_fan/shelf/nes-games/?x=1')).toEqual({
      username: 'retro_fan',
      slug: 'nes-games',
    })
  })

  it('ignores every other page', () => {
    for (const path of ['/', '/games/1', '/u/retro_fan', '/blueprints/x']) {
      expect(parseSharePath(path)).toBeNull()
    }
    expect(parseSharePath('/u/%E0%A4%A/shelf')).toBeNull()
  })
})

describe('previews', () => {
  it('describe a collection by its description, or else its size', () => {
    expect(
      collectionPreview({
        collection: 'NES Games',
        owner: 'Retro Fan',
        description: null,
        itemCount: 12,
      }),
    ).toEqual({
      title: {
        key: 'preview.collectionTitle',
        params: { collection: 'NES Games', owner: 'Retro Fan' },
      },
      description: { key: 'preview.gameCount', params: { count: 12 } },
    })
    expect(
      collectionPreview({
        collection: 'NES Games',
        owner: 'Retro Fan',
        description: 'Every cart.',
        itemCount: 12,
        image: 'https://img/cover.jpg',
      }).description,
    ).toEqual({ key: 'preview.text', params: { text: 'Every cart.' } })
  })

  it('describe a shelf by its public collections', () => {
    expect(shelfPreview({ owner: 'Retro Fan', collectionCount: 3 })).toEqual({
      title: { key: 'preview.shelfTitle', params: { owner: 'Retro Fan' } },
      description: { key: 'preview.collectionCount', params: { count: 3 } },
    })
  })
})
