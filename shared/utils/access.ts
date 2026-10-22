/**
 * The one place that decides who may do what. Pure and framework-free, so
 * the server routes and the browser ask the same question the same way:
 * `can(subject, action, resource?)` answers true or false.
 *
 * - `subject` is `null` for a visitor, otherwise `{ id, roles }`. Every
 *   account holds the "user" role, stored in `roles` like any other.
 * - `action` is named `resource.verb`. Anything without a rule is refused.
 * - `resource` carries the attributes a rule needs (the owner, a
 *   collection's visibility, a field's hidden flag). Actions on the
 *   subject's own data leave it out, and it then means "their own".
 *
 * Permissions are the union of what the subject's roles grant and what the
 * attribute rules allow. There are no deny rules.
 *
 * Routes never compare roles or `owner_id` themselves: they call
 * `authorize()` (server/utils/authorize.ts), which calls this. Queries keep
 * their `owner_id` scoping as well, as defence in depth: the SQL filter
 * stays even where the policy has already said yes.
 *
 * To add an action: add its name to `ACTIONS` and a rule to `RULES` (or to a
 * role in `ROLE_ACTIONS`). Without either, it is refused.
 *
 * To add a role: add it to `ROLES` and `ROLE_ACTIONS`, and widen the check
 * on `users.roles` in a migration. Roles are granted by hand in SQL.
 *
 * To add a rule that ignores who owns something (say `comment.hide` for a
 * moderator): add the action, then list it under the role in `ROLE_ACTIONS`.
 * A role-granted action skips the attribute rules, so it works on anyone's
 * comment. Keep such a grant out of `RULES`, and don't hand a role actions it
 * doesn't need. `admin` grants no data access, so it reads nobody's private
 * data.
 */

/** The roles an account can hold. Every account has "user". */
export const ROLES = ['user', 'admin'] as const
export type Role = (typeof ROLES)[number]

export interface Subject {
  id: string
  roles: readonly Role[]
}

export const ACTIONS = [
  'account.read',
  'account.update',
  'account.delete',
  'library.read',
  'library.write',
  'collection.create',
  'collection.read',
  'collection.update',
  'collection.delete',
  'list.read',
  'field.read',
  'export.read',
  'barcodes.lookup',
  'barcodes.review',
] as const
export type Action = (typeof ACTIONS)[number]

/** What a rule may look at. Each action reads the attributes it needs. */
export interface Resource {
  ownerId?: string
  visibility?: 'private' | 'public'
  /** A field the owner keeps from visitors. */
  hidden?: boolean
}

type Rule = (subject: Subject | null, resource?: Resource) => boolean

/** Actions a role grants on its own, whoever owns the thing. */
const ROLE_ACTIONS: Record<Role, readonly Action[]> = {
  // Every account's basic permissions (own data, public things) come from the
  // attribute rules in `RULES`. Roles only add actions on top, so don't list
  // basic actions here or the rules get duplicated.
  user: [],
  admin: ['barcodes.review'],
}

const signedIn: Rule = (subject) => subject !== null

/** The subject's own data: no resource means theirs, otherwise its owner. */
const ownData: Rule = (subject, resource) =>
  subject !== null && (!resource || resource.ownerId === subject.id)

/** Only the owner, so a resource must say who it belongs to. */
const ownerOnly: Rule = (subject, resource) =>
  subject !== null && resource?.ownerId === subject.id

const ownerOrPublic: Rule = (subject, resource) =>
  ownerOnly(subject, resource) || resource?.visibility === 'public'

// These rules apply to any signed-in subject and don't look at the `user`
// role. An account without it (a future suspension, say) would need an
// explicit rule.
const RULES: Partial<Record<Action, Rule>> = {
  // Your own account only. The /api/me routes act on the signed-in user, but
  // a route that names an account must pass it, and only its owner may.
  'account.read': ownData,
  'account.update': ownData,
  'account.delete': ownData,
  'library.read': ownData,
  'library.write': ownData,
  'collection.create': ownData,
  'collection.read': ownerOrPublic,
  'collection.update': ownerOnly,
  'collection.delete': ownerOnly,
  'list.read': ownerOrPublic,
  // The owner sees every field. Anyone else, only the ones not hidden. The
  // resource must say whether the field is hidden, or the answer is no.
  'field.read': (subject, resource) =>
    resource !== undefined &&
    typeof resource.hidden === 'boolean' &&
    (ownerOnly(subject, resource) || !resource.hidden),
  'export.read': ownData,
  'barcodes.lookup': signedIn,
}

/** Whether the subject (null for a visitor) may do this. Refuses by default. */
export function can(
  subject: Subject | null,
  action: Action,
  resource?: Resource,
): boolean {
  if (
    subject?.roles.some(
      (role) =>
        Object.hasOwn(ROLE_ACTIONS, role) &&
        ROLE_ACTIONS[role].includes(action),
    )
  ) {
    return true
  }
  if (!Object.hasOwn(RULES, action)) return false
  return RULES[action]!(subject, resource)
}

/** Whether the subject sees this owner's data as the owner does. */
export function seesAllOf(subject: Subject | null, ownerId: string): boolean {
  return can(subject, 'library.read', { ownerId })
}

/** Who is looking at whose data, for shaping what they get to see. */
export interface Viewer {
  subject: Subject | null
  ownerId: string
}
