import { describe, expect, it } from 'vitest'
import {
  ACTIONS,
  can,
  seesAllOf,
  type Action,
  type Resource,
  type Subject,
} from './access'

const owner: Subject = { id: 'owner', roles: [] }
const other: Subject = { id: 'other', roles: [] }
const admin: Subject = { id: 'admin', roles: ['admin'] }
const ownerAdmin: Subject = { id: 'owner', roles: ['admin'] }

const mine = { ownerId: 'owner' }
const publicOf = (ownerId: string): Resource => ({
  ownerId,
  visibility: 'public',
})
const privateOf = (ownerId: string): Resource => ({
  ownerId,
  visibility: 'private',
})

type Who = 'visitor' | 'owner' | 'other' | 'admin'
const subjects: Record<Who, Subject | null> = {
  visitor: null,
  owner,
  other,
  admin,
}

function allow(
  visitor: boolean,
  ownerAllowed: boolean,
  otherAllowed: boolean,
  adminAllowed: boolean,
): Record<Who, boolean> {
  return {
    visitor,
    owner: ownerAllowed,
    other: otherAllowed,
    admin: adminAllowed,
  }
}

const nobody = allow(false, false, false, false)
const signedIn = allow(false, true, true, true)
const ownerOnly = allow(false, true, false, false)
const everyone = allow(true, true, true, true)

/** Each row: the action, the resource, and who may do it. */
const table: [Action, string, Resource | undefined, Record<Who, boolean>][] = [
  ['account.read', 'own account', undefined, signedIn],
  ['account.update', 'own account', undefined, signedIn],
  ['account.delete', 'own account', undefined, signedIn],
  ['library.read', 'own library', undefined, signedIn],
  ['library.read', "someone's library", mine, ownerOnly],
  ['library.write', 'own library', undefined, signedIn],
  ['library.write', "someone's library", mine, ownerOnly],
  ['collection.create', 'own library', undefined, signedIn],
  ['collection.read', 'public', publicOf('owner'), everyone],
  ['collection.read', 'private', privateOf('owner'), ownerOnly],
  ['collection.read', 'no attributes', undefined, nobody],
  ['collection.update', 'public', publicOf('owner'), ownerOnly],
  ['collection.update', 'private', privateOf('owner'), ownerOnly],
  ['collection.update', 'no attributes', undefined, nobody],
  ['collection.delete', 'public', publicOf('owner'), ownerOnly],
  ['collection.delete', 'private', privateOf('owner'), ownerOnly],
  ['collection.delete', 'no attributes', undefined, nobody],
  ['list.read', 'public', publicOf('owner'), everyone],
  ['list.read', 'private', privateOf('owner'), ownerOnly],
  ['list.read', 'no attributes', undefined, nobody],
  ['field.read', 'shown', { ownerId: 'owner', hidden: false }, everyone],
  ['field.read', 'no flag', { ownerId: 'owner' }, everyone],
  ['field.read', 'hidden', { ownerId: 'owner', hidden: true }, ownerOnly],
  ['field.read', 'no attributes', undefined, nobody],
  ['export.read', 'own library', undefined, signedIn],
  ['export.read', "someone's library", mine, ownerOnly],
  ['barcodes.lookup', 'anything', undefined, signedIn],
  ['barcodes.review', 'anything', undefined, allow(false, false, false, true)],
]

describe('can', () => {
  for (const [action, what, resource, expected] of table) {
    for (const who of Object.keys(expected) as Who[]) {
      it(`${action} on ${what}: ${who} ${expected[who] ? 'may' : 'may not'}`, () => {
        expect(can(subjects[who], action, resource)).toBe(expected[who])
      })
    }
  }

  it('has a row in the table for every action', () => {
    const covered = new Set(table.map(([action]) => action))
    expect([...ACTIONS].filter((action) => !covered.has(action))).toEqual([])
  })

  it('refuses an action it has no rule for, whoever asks', () => {
    for (const subject of [null, owner, admin]) {
      expect(can(subject, 'nothing.here' as Action)).toBe(false)
      expect(can(subject, 'constructor' as Action)).toBe(false)
      expect(can(subject, 'toString' as Action, mine)).toBe(false)
    }
  })

  it('ignores a role it does not know', () => {
    const odd = { id: 'owner', roles: ['toString'] } as unknown as Subject
    expect(can(odd, 'barcodes.review')).toBe(false)
  })

  it('gives an admin no more data access than anyone else', () => {
    const resources = [privateOf('owner'), { ownerId: 'owner', hidden: true }]
    for (const action of ACTIONS) {
      if (action === 'barcodes.review') continue
      for (const resource of resources) {
        expect(can(admin, action, resource)).toBe(can(other, action, resource))
      }
    }
  })

  it('lets an admin who owns something use it as its owner', () => {
    expect(can(ownerAdmin, 'collection.update', mine)).toBe(true)
    expect(can(ownerAdmin, 'barcodes.review')).toBe(true)
  })
})

describe('seesAllOf', () => {
  it('is true only for the owner', () => {
    expect(seesAllOf(owner, 'owner')).toBe(true)
    expect(seesAllOf(other, 'owner')).toBe(false)
    expect(seesAllOf(admin, 'owner')).toBe(false)
    expect(seesAllOf(null, 'owner')).toBe(false)
  })
})
