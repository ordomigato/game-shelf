import { createError } from 'h3'
import {
  can,
  type Action,
  type Resource,
  type Subject,
} from '../../shared/utils/access'
import type { users } from '../db/schema'

/** The policy's view of a `users` row. */
export const subjectOf = (
  user: Pick<typeof users.$inferSelect, 'id' | 'roles'>,
): Subject => ({
  id: user.id,
  roles: user.roles,
})

/**
 * Throws 404 unless the policy allows it. A 404, not a 403, so a refusal
 * never reveals that someone else's resource, or a feature meant for other
 * roles, exists.
 */
export function assertCan(
  subject: Subject | null,
  action: Action,
  resource?: Resource,
): void {
  if (!can(subject, action, resource)) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
}
