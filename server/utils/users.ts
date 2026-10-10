import { eq } from 'drizzle-orm'
import type { Me, PublicProfile } from '../../shared/types/user'
import { users } from '../db/schema'
import { ensureWishlist } from './collections'

type UserRow = typeof users.$inferSelect

/** The `users` row for a Cognito user, created on their first request. */
export async function findOrCreateUser(cognitoSub: string): Promise<UserRow> {
  const db = useDb()
  const [created] = await db
    .insert(users)
    .values({ cognitoSub })
    .onConflictDoNothing({ target: users.cognitoSub })
    .returning()
  if (created) {
    await ensureWishlist(created.id)
    return created
  }
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.cognitoSub, cognitoSub))
  if (!existing) throw new Error('User row vanished after insert conflict')
  return existing
}

/** The user with this username, or undefined. */
export async function findUserByUsername(
  username: string,
): Promise<UserRow | undefined> {
  const [user] = await useDb()
    .select()
    .from(users)
    .where(eq(users.username, username.toLowerCase()))
  return user
}

export function toPublicProfile(user: UserRow): PublicProfile {
  return {
    username: user.username!,
    displayName: user.displayName,
    memberSince: user.createdAt.toISOString(),
  }
}

export function toMe(user: UserRow): Me {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  }
}
