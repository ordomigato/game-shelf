import { eq, inArray } from 'drizzle-orm'
import { createError, getValidatedRouterParams, type H3Event } from 'h3'
import { z } from 'zod'
import type { Action, Resource, Subject } from '../../shared/utils/access'
import { collections, libraryItems } from '../db/schema'
import type { users } from '../db/schema'
import { assertCan, subjectOf } from './assert-can'
import { optionalAuth, requireAuth, type AuthClaims } from './auth'
import { findOrCreateUser, findUserBySub } from './users'

type UserRow = typeof users.$inferSelect

/** The signed-in user a request acts as, once the policy has allowed it. */
export interface Authorized {
  user: UserRow
  subject: Subject
  claims: AuthClaims
}

/** A resource, or a function that loads it once the caller is known. */
type ResourceInput = Resource | (() => Promise<Resource>)

/**
 * The only way a route that acts on the signed-in user decides access.
 * Verifies the token (401 without one), takes the user from it, and asks
 * `can()`. A refusal is a 404 (see `assertCan`). Routes never check roles or
 * `owner_id` themselves.
 *
 * Pass the resource when the action concerns a specific thing, or a loader
 * that fetches it (like `collectionOf(event)`), which runs only after the
 * caller is signed in. Leave it out for actions on the user's own data.
 *
 * The queries behind a route still filter by `owner_id`, as defence in
 * depth, so a mistake here can't hand over someone else's rows.
 */
export async function authorize(
  event: H3Event,
  action: Action,
  resource?: ResourceInput,
): Promise<Authorized> {
  const claims = await requireAuth(event)
  const user = await findOrCreateUser(claims.sub)
  const subject = subjectOf(user)
  assertCan(
    subject,
    action,
    typeof resource === 'function' ? await resource() : resource,
  )
  return { user, subject, claims }
}

/**
 * Like `authorize` for an account action that must not create a user row
 * (deleting the account). The subject comes from the verified token; an
 * account with no row yet has no id or roles of its own.
 */
export async function authorizeAccount(
  event: H3Event,
  action: Action,
): Promise<{ subject: Subject; claims: AuthClaims }> {
  const claims = await requireAuth(event)
  const user = await findUserBySub(claims.sub)
  const subject = user ? subjectOf(user) : { id: claims.sub, roles: [] }
  assertCan(subject, action)
  return { subject, claims }
}

/**
 * Who is asking on a route anyone may call: null for a visitor, otherwise the
 * signed-in user. A token that is present but invalid is a 401. Never creates
 * a user row. Follow it with `assertCan` once the resource is known.
 */
export async function viewerOf(event: H3Event): Promise<Subject | null> {
  const claims = await optionalAuth(event)
  if (!claims) return null
  const user = await findUserBySub(claims.sub)
  return user ? subjectOf(user) : null
}

/** The `{ ownerId, visibility }` of a collection, or a 404 if it doesn't exist. */
export async function collectionResource(id: string): Promise<Resource> {
  const [row] = await useDb()
    .select({
      ownerId: collections.ownerId,
      visibility: collections.visibility,
    })
    .from(collections)
    .where(eq(collections.id, id))
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return row
}

/** Several collections' resources. A 404 if any doesn't exist. */
export async function collectionResources(ids: string[]): Promise<Resource[]> {
  const asked = [...new Set(ids)]
  if (!asked.length) return []
  const rows = await useDb()
    .select({
      ownerId: collections.ownerId,
      visibility: collections.visibility,
    })
    .from(collections)
    .where(inArray(collections.id, asked))
  if (rows.length !== asked.length)
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return rows
}

/** The `{ ownerId }` of a library item, or a 404 if it doesn't exist. */
export async function itemResource(id: string): Promise<Resource> {
  const [row] = await useDb()
    .select({ ownerId: libraryItems.ownerId })
    .from(libraryItems)
    .where(eq(libraryItems.id, id))
  if (!row) throw createError({ statusCode: 404, statusMessage: 'Not found' })
  return row
}

/** The router param as a uuid, checked like the route's own params are. */
async function uuidParam(event: H3Event, param: string): Promise<string> {
  const params = await getValidatedRouterParams(
    event,
    z.object({ [param]: z.uuid() }).parse,
  )
  return params[param]!
}

/** Loader for a route's collection, from its router param (`id` by default). */
export const collectionOf = (event: H3Event, param = 'id') => {
  return async () => collectionResource(await uuidParam(event, param))
}

/** Loader for a route's library item, from its router param. */
export const itemOf = (event: H3Event, param = 'id') => {
  return async () => itemResource(await uuidParam(event, param))
}

/** Throws 404 unless the policy allows the action on every one of these collections. */
export async function assertCanOnCollections(
  subject: Subject,
  action: Action,
  ids: string[],
): Promise<void> {
  for (const resource of await collectionResources(ids)) {
    assertCan(subject, action, resource)
  }
}
