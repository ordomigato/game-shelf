import type { FieldDefinition } from '../../../../shared/types/collection'

/**
 * Replaces the user's fields, carrying every game's stored values over. A
 * new field past the plan's limit is refused.
 */
export default defineEventHandler(async (event): Promise<FieldDefinition[]> => {
  const { user } = await authorize(event, 'account.update')
  const { fields, optionRenames } = await readValidatedBody(
    event,
    fieldsBodySchema.parse,
  )
  assertFieldRoom(user.fields, fields, userLimits(user))
  return updateUserFields(
    user.id,
    fields as FieldDefinition[],
    optionRenames,
    userLimits(user).textLength,
  )
})
