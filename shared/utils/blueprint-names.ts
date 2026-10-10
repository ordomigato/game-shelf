import type { FieldDefinition, ItemData } from '../types/collection'
import type { Message } from '../types/message'

export const BLUEPRINT_NAME_MAX_LENGTH = 60

/** Why a blueprint can't have this name, or null when it can. */
export function blueprintNameProblem(name: string): Message | null {
  const trimmed = name.trim()
  if (!trimmed) return { key: 'blueprints.errors.nameRequired' }
  if (trimmed.length > BLUEPRINT_NAME_MAX_LENGTH) {
    return {
      key: 'blueprints.errors.nameTooLong',
      params: { max: BLUEPRINT_NAME_MAX_LENGTH },
    }
  }
  return null
}

/**
 * A blueprint's fields copied for a collection of its own, each with a new
 * id. New ids matter: values are stored on a game by field id, so a copy
 * that kept the ids would still share values with the blueprint's other
 * collections. Returns the copy and old id to new id.
 */
export function copyFields(
  fields: FieldDefinition[],
  newId: () => string = () => crypto.randomUUID(),
): { fields: FieldDefinition[]; idMap: Record<string, string> } {
  const idMap: Record<string, string> = {}
  const copy = fields.map((field) => {
    idMap[field.id] = newId()
    return {
      ...field,
      id: idMap[field.id]!,
      ...(field.options && { options: [...field.options] }),
    }
  })
  return { fields: copy, idMap }
}

/**
 * A game's values with each copied field's value also stored under the
 * copy's id, so the detached collection starts with the same values. The
 * originals stay for the blueprint's other collections. Null when the game
 * has none of the fields.
 */
export function copyValues(
  data: ItemData,
  idMap: Record<string, string>,
): ItemData | null {
  const copied = Object.entries(idMap).filter(([from]) => from in data)
  if (!copied.length) return null
  return {
    ...data,
    ...Object.fromEntries(copied.map(([from, to]) => [to, data[from]!])),
  }
}
