import { describe, expect, it } from 'vitest'
import {
  applyListAction,
  listStateValid,
  newListState,
  type ListAction,
  type ListState,
} from './lists'

const XBOX_360 = 12
const PS4 = 48

const ownedOnly: ListState = {
  owned: true,
  wishlisted: false,
  ownedOn: [],
  wantedOn: [],
}
const wantedOnly: ListState = {
  owned: false,
  wishlisted: true,
  ownedOn: [],
  wantedOn: [],
}
const bothVersions: ListState = {
  owned: true,
  wishlisted: true,
  ownedOn: [XBOX_360],
  wantedOn: [PS4],
}

describe('newListState', () => {
  it('starts an owned game owned only', () => {
    expect(newListState('owned', [PS4, PS4])).toEqual({
      owned: true,
      wishlisted: false,
      ownedOn: [PS4],
      wantedOn: [],
    })
  })

  it('starts a wanted game wishlisted only', () => {
    expect(newListState('wishlist', [])).toEqual(wantedOnly)
  })
})

describe('listStateValid', () => {
  it('accepts one list, or both across different versions', () => {
    for (const state of [ownedOnly, wantedOnly, bothVersions]) {
      expect(listStateValid(state)).toBe(true)
    }
  })

  it('refuses both lists without a wanted platform', () => {
    expect(listStateValid({ ...ownedOnly, wishlisted: true })).toBe(false)
  })

  it('refuses a platform on both lists, or a platform without its list', () => {
    expect(listStateValid({ ...bothVersions, ownedOn: [PS4] })).toBe(false)
    expect(listStateValid({ ...wantedOnly, ownedOn: [PS4] })).toBe(false)
    expect(listStateValid({ ...ownedOnly, wantedOn: [PS4] })).toBe(false)
  })

  it('refuses a game on neither list', () => {
    expect(listStateValid({ ...ownedOnly, owned: false })).toBe(false)
  })
})

describe('applyListAction', () => {
  it('Got it moves the wanted platforms to owned', () => {
    expect(
      applyListAction({ ...wantedOnly, wantedOn: [PS4] }, { type: 'gotIt' }),
    ).toEqual({ owned: true, wishlisted: false, ownedOn: [PS4], wantedOn: [] })
  })

  it('Got it with no platform named just flips the flag', () => {
    expect(applyListAction(wantedOnly, { type: 'gotIt' })).toEqual(ownedOnly)
  })

  it('Move to Wishlist keeps the owned platforms as the wanted ones', () => {
    expect(
      applyListAction(
        { ...ownedOnly, ownedOn: [XBOX_360] },
        { type: 'toWishlist' },
      ),
    ).toEqual({
      owned: false,
      wishlisted: true,
      ownedOn: [],
      wantedOn: [XBOX_360],
    })
  })

  it('ticking Owned on a wanted game gets it, and ticking Owned twice is a no-op', () => {
    expect(applyListAction(wantedOnly, { type: 'own' })).toEqual(ownedOnly)
    expect(applyListAction(ownedOnly, { type: 'own' })).toBe(ownedOnly)
  })

  it('ticking the Wishlist on an owned game moves it there', () => {
    expect(applyListAction(ownedOnly, { type: 'want' })).toEqual(wantedOnly)
  })

  it('names the owned platforms of a wanted game, making it both', () => {
    expect(
      applyListAction(
        { ...wantedOnly, wantedOn: [XBOX_360, PS4] },
        { type: 'setOwnedOn', platforms: [XBOX_360] },
      ),
    ).toEqual(bothVersions)
  })

  it('owning a wanted game on the platform it wanted gets it', () => {
    expect(
      applyListAction(
        { ...wantedOnly, wantedOn: [PS4] },
        { type: 'setOwnedOn', platforms: [PS4] },
      ),
    ).toEqual({ owned: true, wishlisted: false, ownedOn: [PS4], wantedOn: [] })
  })

  it('wants another version of an owned game', () => {
    expect(
      applyListAction(
        { ...ownedOnly, ownedOn: [XBOX_360] },
        { type: 'setWantedOn', platforms: [PS4] },
      ),
    ).toEqual(bothVersions)
  })

  it('clearing the wanted platforms of an owned game takes it off the Wishlist', () => {
    expect(
      applyListAction(bothVersions, { type: 'setWantedOn', platforms: [] }),
    ).toEqual({
      owned: true,
      wishlisted: false,
      ownedOn: [XBOX_360],
      wantedOn: [],
    })
  })

  it('taking a game off one list keeps the other', () => {
    expect(applyListAction(bothVersions, { type: 'unown' })).toEqual({
      owned: false,
      wishlisted: true,
      ownedOn: [],
      wantedOn: [PS4],
    })
    expect(applyListAction(bothVersions, { type: 'unwant' })).toEqual({
      owned: true,
      wishlisted: false,
      ownedOn: [XBOX_360],
      wantedOn: [],
    })
  })

  it('taking a game off its only list leaves it on none', () => {
    expect(applyListAction(ownedOnly, { type: 'unown' })).toBeNull()
    expect(applyListAction(wantedOnly, { type: 'unwant' })).toBeNull()
  })

  it('never produces a state the database would refuse', () => {
    const actions: ListAction[] = [
      { type: 'gotIt' },
      { type: 'toWishlist' },
      { type: 'own' },
      { type: 'want' },
      { type: 'setOwnedOn', platforms: [] },
      { type: 'setOwnedOn', platforms: [PS4] },
      { type: 'setOwnedOn', platforms: [XBOX_360, PS4] },
      { type: 'setWantedOn', platforms: [] },
      { type: 'setWantedOn', platforms: [PS4] },
      { type: 'setWantedOn', platforms: [XBOX_360, PS4] },
      { type: 'unown' },
      { type: 'unwant' },
    ]
    const starts: ListState[] = [
      ownedOnly,
      wantedOnly,
      bothVersions,
      { ...ownedOnly, ownedOn: [PS4] },
      { ...wantedOnly, wantedOn: [XBOX_360, PS4] },
      { owned: true, wishlisted: true, ownedOn: [], wantedOn: [PS4] },
    ]
    for (const start of starts) {
      expect(listStateValid(start)).toBe(true)
      for (const action of actions) {
        const next = applyListAction(start, action)
        if (next)
          expect(
            listStateValid(next),
            JSON.stringify([start, action, next]),
          ).toBe(true)
      }
    }
  })
})
