import type { FieldDefinition } from '../../../../shared/types/collection'

/**
 * Replaces the user's fields, carrying every game's stored values over. A
 * new field past the plan's limit is refused.
 */
export default defineEventHandler(async (event): Promise<FieldDefinition[]> => {
  const { sub } = await requireAuth(event)
  const { fields, optionRenames } = await readValidatedBody(
    event,
    fieldsBodySchema.parse,
  )
  const user = await findOrCreateUser(sub)
  assertFieldRoom(user.fields, fields, userLimits(user))
  return updateUserFields(user.id, fields as FieldDefinition[], optionRenames)
})
