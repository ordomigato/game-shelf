import { eq } from 'drizzle-orm'
import type { Me } from '../../shared/types/user'
import { users } from '../db/schema'

type UserRow = typeof users.$inferSelect

/** The `users` row for a Cognito user, created on their first request. */
export async function findOrCreateUser(cognitoSub: string): Promise<UserRow> {
  const db = useDb()
  const [created] = await db
    .insert(users)
    .values({ cognitoSub })
    .onConflictDoNothing({ target: users.cognitoSub })
    .returning()
  if (created) return created
  const [existing] = await db
    .select()
    .from(users)
    .where(eq(users.cognitoSub, cognitoSub))
  if (!existing) throw new Error('User row vanished after insert conflict')
  return existing
}

export function toMe(user: UserRow): Me {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    createdAt: user.createdAt.toISOString(),
  }
}

/** True when a database error is a unique-constraint violation. */
export function isUniqueViolation(error: unknown): boolean {
  let current: unknown = error
  for (let depth = 0; depth < 4 && current; depth++) {
    if ((current as { code?: unknown }).code === '23505') return true
    current = (current as { cause?: unknown }).cause
  }
  return false
}
