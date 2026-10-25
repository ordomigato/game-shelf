import type { FieldDefinition } from '../../../../shared/types/collection'

/** The extra fields the signed-in user keeps for their games. */
export default defineEventHandler(async (event): Promise<FieldDefinition[]> => {
  const { user } = await authorize(event, 'account.read')
  return user.fields
})
