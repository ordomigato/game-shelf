import { eq } from 'drizzle-orm'
import { z } from 'zod'
import type { Me } from '../../shared/types/user'
import { users } from '../db/schema'

const bodySchema = z
  .object({
    username: z
      .string()
      .transform(normalizeUsername)
      .refine((value) => usernameProblem(value) === null, {
        message: 'Invalid username',
      })
      .optional(),
    displayName: z
      .string()
      .trim()
      .max(50)
      .transform((value) => value || null)
      .nullable()
      .optional(),
  })
  .refine(
    (body) => body.username !== undefined || body.displayName !== undefined,
  )

export default defineEventHandler(async (event): Promise<Me> => {
  const { sub } = await requireAuth(event)
  const body = await readValidatedBody(event, bodySchema.parse)
  await findOrCreateUser(sub)

  try {
    const [updated] = await useDb()
      .update(users)
      .set({
        ...(body.username !== undefined && { username: body.username }),
        ...(body.displayName !== undefined && {
          displayName: body.displayName,
        }),
      })
      .where(eq(users.cognitoSub, sub))
      .returning()
    if (!updated) throw new Error('User row missing during update')
    return toMe(updated)
  } catch (error) {
    if (isUniqueViolation(error)) {
      throw createError({ statusCode: 409, statusMessage: 'Username taken' })
    }
    throw error
  }
})
