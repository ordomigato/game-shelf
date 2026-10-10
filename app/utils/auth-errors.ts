const messages: Record<string, string> = {
  UsernameExistsException:
    'An account with that email already exists. Try signing in.',
  NotAuthorizedException: "That email and password don't match.",
  UserNotFoundException: "That email and password don't match.",
  CodeMismatchException:
    "That code isn't right. Check the email and try again.",
  ExpiredCodeException: 'That code has expired. Send a new one.',
  InvalidPasswordException:
    'Passwords need at least 8 characters, with a capital letter, a lowercase letter and a number.',
  InvalidParameterException: 'Check the details and try again.',
  LimitExceededException:
    'Too many attempts. Wait a few minutes and try again.',
  TooManyRequestsException:
    'Too many attempts. Wait a few minutes and try again.',
  TooManyFailedAttemptsException:
    'Too many attempts. Wait a few minutes and try again.',
  CodeDeliveryFailureException:
    "We couldn't send the email. Check the address and try again.",
  EmptySignInUsername: 'Enter your email.',
  EmptySignInPassword: 'Enter your password.',
  EmptySignUpUsername: 'Enter your email.',
  EmptySignUpPassword: 'Enter a password.',
  EmptyConfirmSignUpCode: 'Enter the code from the email.',
  EmptyConfirmResetPasswordConfirmationCode: 'Enter the code from the email.',
  EmptyConfirmResetPasswordNewPassword: 'Enter a new password.',
  UserAlreadyAuthenticatedException: "You're already signed in.",
  NetworkError: "Can't reach the server. Check your connection and try again.",
}

export const GENERIC_AUTH_ERROR = 'Something went wrong. Try again.'

/**
 * Turns an Amplify or Cognito error into a sentence for the user. Unknown
 * errors get a generic message, and the original goes to the console.
 */
export function authErrorMessage(error: unknown): string {
  const name = (error as { name?: unknown } | null)?.name
  if (typeof name === 'string' && name in messages) return messages[name]!
  console.error(error)
  return GENERIC_AUTH_ERROR
}
