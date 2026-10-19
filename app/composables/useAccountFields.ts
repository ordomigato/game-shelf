import type { FieldDefinition, FieldsImpact } from '#shared/types/collection'

type OptionRenames = Record<string, Record<string, string>>

/**
 * The extra fields the signed-in user keeps for their games. One set per
 * account, shared by every game and collection.
 */
export function useAccountFields() {
  const auth = useAuth()

  return {
    get: () => auth.apiFetch<FieldDefinition[]>('/api/me/fields'),

    /** What saving these fields would change, without saving. */
    preview: (fields: FieldDefinition[], optionRenames: OptionRenames) =>
      auth.apiFetch<FieldsImpact>('/api/me/fields/preview', {
        method: 'POST',
        body: { fields, optionRenames },
      }),

    /** Replaces the fields. Every game's stored values are carried over. */
    save: (fields: FieldDefinition[], optionRenames: OptionRenames) =>
      auth.apiFetch<FieldDefinition[]>('/api/me/fields', {
        method: 'PUT',
        body: { fields, optionRenames },
      }),
  }
}
