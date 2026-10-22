import { and, eq, inArray } from 'drizzle-orm'
import { barcodeLookups, users } from '../db/schema'

/**
 * Deletes a user's rows, in one transaction: first their barcode picks that
 * are pending or rejected, then the user (their collections and items
 * cascade). Approved picks stay and serve everyone, and lose the name
 * through the foreign key (`on delete set null`).
 */
export async function deleteAccountData(cognitoSub: string): Promise<void> {
  const db = useDb()
  await db.batch([
    db
      .delete(barcodeLookups)
      .where(
        and(
          eq(barcodeLookups.source, 'user'),
          inArray(barcodeLookups.status, ['pending', 'rejected']),
          inArray(
            barcodeLookups.submittedBy,
            db
              .select({ id: users.id })
              .from(users)
              .where(eq(users.cognitoSub, cognitoSub)),
          ),
        ),
      ),
    db.delete(users).where(eq(users.cognitoSub, cognitoSub)),
  ])
}
