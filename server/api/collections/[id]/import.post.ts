import { z } from 'zod'
import {
  IMPORT_CHUNK_SIZE,
  MAX_ROW_PLATFORMS,
  PLATFORM_NAME_MAX,
} from '../../../../shared/utils/csv-import'
import type { ImportResult } from '../../../utils/import'

const paramsSchema = z.object({ id: z.uuid() })
const bodySchema = z.object({
  /** The fields after import, sent with the first chunk only. */
  fields: fieldsBodySchema.shape.fields.optional(),
  rows: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(200),
        igdbId: z.number().int().positive().nullable(),
        values: z.record(z.string().max(64), z.unknown()),
        platforms: z
          .array(z.string().trim().min(1).max(PLATFORM_NAME_MAX))
          .max(MAX_ROW_PLATFORMS)
          .optional(),
        row: z.number().int().positive().optional(),
      }),
    )
    .min(1)
    .max(IMPORT_CHUNK_SIZE),
})

/** Imports one chunk of a CSV file's games into a collection. */
export default defineEventHandler(async (event): Promise<ImportResult> => {
  const { sub } = await requireAuth(event)
  const { id } = await getValidatedRouterParams(event, paramsSchema.parse)
  const user = await findOrCreateUser(sub)
  // About 15,000 games in ten minutes: plenty for real files.
  await rateLimit(event, `import:${user.id}`, { limit: 60, windowSeconds: 600 })
  const { fields, rows } = await readValidatedBody(event, bodySchema.parse)
  return importIntoCollection(user.id, id, userLimits(user), {
    fields: fields as Parameters<typeof importIntoCollection>[3]['fields'],
    rows: rows as Parameters<typeof importIntoCollection>[3]['rows'],
  })
})
