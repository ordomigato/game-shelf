import {
  AdminDeleteUserCommand,
  CognitoIdentityProviderClient,
} from '@aws-sdk/client-cognito-identity-provider'
import { Resource } from 'sst'

const cognito = new CognitoIdentityProviderClient({})

/**
 * Deletes the signed-in user's data (see `deleteAccountData`)
 * and then their Cognito account. If the Cognito step fails, the data is
 * already gone. Signing in again would just start a fresh, empty account.
 */
export default defineEventHandler(async (event) => {
  const { claims } = await authorize(event, 'account.delete')
  await deleteAccountData(claims.sub)

  try {
    await cognito.send(
      new AdminDeleteUserCommand({
        UserPoolId: Resource.Users.id,
        Username: claims.username,
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
