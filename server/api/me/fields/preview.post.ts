import type {
  FieldDefinition,
  FieldsImpact,
} from '../../../../shared/types/collection'

/**
 * What saving these fields would change, without saving: per field, how
 * many of the user's games would lose a value.
 */
export default defineEventHandler(async (event): Promise<FieldsImpact> => {
  const { sub } = await requireAuth(event)
  const { fields, optionRenames } = await readValidatedBody(
    event,
    fieldsBodySchema.parse,
  )
  const user = await findOrCreateUser(sub)
  return previewUserFields(user.id, fields as FieldDefinition[], optionRenames)
})
