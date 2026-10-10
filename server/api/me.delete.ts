import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider'
import { eq } from 'drizzle-orm'
import { Resource } from 'sst'
import { users } from '../db/schema'

const cognito = new CognitoIdentityProviderClient({})

/**
 * Deletes the signed-in user's data (their collections and items cascade)
 * and then their Cognito account. If the Cognito step fails, the data is
 * already gone. Signing in again would just start a fresh, empty account.
 */
export default defineEventHandler(async (event) => {
  const { sub, username } = await requireAuth(event)
  await useDb().delete(users).where(eq(users.cognitoSub, sub))

  try {
    await cognito.send(
      new AdminDeleteUserCommand({
        UserPoolId: Resource.Users.id,
        Username: username,
      }),
    )
  } catch (error) {
    log('error', 'account.cognito_delete_failed', { message: String(error) })
    throw createError({
      statusCode: 502,
      statusMessage: 'Account deletion incomplete',
    })
  }

  log('info', 'account.deleted')
  setResponseStatus(event, 204)
  return null
})
