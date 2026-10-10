---
name: auth
description: >
  Use whenever touching sign-up, sign-in, sign-out, password reset, the
  username step, account settings, `useAuth`, `requireAuth`, `/api/me`, the
  Cognito user pool or client settings, or any server route that acts on
  "the current user". Covers how a request's user is established, which
  pages render where, error messages, and how to test auth for real.
---

# Accounts and auth

## How it fits together

- **Cognito** (`Users` pool, `WebClient` client in `sst.config.ts`) owns
  emails and passwords. The client allows only SRP sign-in and token
  refresh. Hosted-UI OAuth is switched off, user-existence errors are hidden,
  and tokens can be revoked. Don't re-enable `implicit`.
- **The browser** signs in with Amplify (`aws-amplify/auth`), configured in
  `app/plugins/amplify.client.ts` from `runtimeConfig.public`. Amplify keeps
  the tokens. `useAuth()` (`app/composables/useAuth.ts`) wraps every action
  and exposes `status` (`loading | signedOut | signedIn`) and `me`.
- **The server** never trusts the browser about who it is. A route that acts
  on the current user calls `requireAuth(event)` (`server/utils/auth.ts`),
  which verifies the Cognito **access token** from `Authorization: Bearer`
  (signature, expiry, issuer, client) and returns `{ sub, username }`. The
  user comes from there only, never from the body, query or route params.
  Call routes from the browser with `useAuth().apiFetch`, which attaches the
  token.
- **Postgres** `users` rows are keyed by `cognito_sub` and created on the
  first `/api/me` call (`findOrCreateUser`). No email or password is stored
  in Postgres.

## Pages and rendering

Pages that depend on who is signed in (`/login`, `/signup`, `/verify`,
`/forgot-password`, `/welcome`, `/account`) render in the browser only
(`routeRules` with `ssr: false` in `nuxt.config.ts`). The server can't know
the user, and server-rendering them caused hydration mismatches. Add new
signed-in pages to that list.

- `middleware: 'auth'`: signed-in only, otherwise sent to
  `/login?redirect=…`.
- `middleware: 'guest'`: sign-in and sign-up pages, which send signed-in
  users home.
- `username.global.ts`: a signed-in user without a username goes to
  `/welcome`. During the first page load it checks in the background so
  server-rendered pages stay fast.
- Any `?redirect=` goes through `safeRedirect()`, which only allows paths
  on this site. Never `navigateTo` a raw query value.

## Usernames

Rules live in `shared/utils/username.ts` (3 to 20 lowercase letters,
numbers, underscores), used by both the browser and the server, and are
also enforced by a Postgres check constraint. Usernames are stored
lowercased. A taken username is a 409 from `PATCH /api/me`.

## Password fields

Every password field uses `PasswordInput` (show/hide button). Anywhere a
new password is chosen uses `NewPasswordFields`: password, confirmation and
a live rules checklist. Check `newPasswordProblem()` before calling Cognito.
The rules in `shared/utils/password.ts` mirror the pool's password policy in
`sst.config.ts`, so change both together.

## Messages

Every Cognito/Amplify error goes through `authErrorMessage()`
(`app/utils/auth-errors.ts`). Add a mapping when a new error appears rather
than showing `error.message`. Sign-in errors never reveal whether an email
is registered. Follow `plain-language`.

## Deleting an account

`DELETE /api/me` deletes the `users` row (collections cascade) and then the
Cognito user with `AdminDeleteUser`. The site's link to the user pool grants
`cognito-idp:*` on that pool only.

## Testing

- Unit: username rules, error mapping, `safeRedirect`, `bearerToken`.
- E2E in CI stubs Cognito's API (`e2e/auth.spec.ts`) with placeholder pool
  ids from `playwright.config.ts`. It covers redirects, links and error
  messages, not a successful sign-in.
- Real flows: test against the `dev` pool with a throwaway user created by
  `aws cognito-idp admin-create-user --message-action SUPPRESS` and
  `admin-set-user-password --permanent` (an `@example.com` address, so no
  email is sent), then delete it through the app. Never use a real person's
  email, and leave the pool as you found it.
- Cognito's default email sender allows about 50 emails a day. Fine for
  dev. Switch to SES before real sign-ups.
