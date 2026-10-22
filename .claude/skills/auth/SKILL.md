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
  on the current user calls `authorize(event, action, resource?)`
  (`server/utils/authorize.ts`). It runs `requireAuth` (`server/utils/auth.ts`),
  which verifies the Cognito **access token** from `Authorization: Bearer`
  (signature, expiry, issuer, client) and gets `{ sub, username }`, then loads
  the user and asks the access policy (below). The user comes from the token
  only, never from the body, query or route params.
  Call routes from the browser with `useAuth().apiFetch`, which attaches the
  token.
- **Postgres** `users` rows are keyed by `cognito_sub` and created on the
  first `/api/me` call (`findOrCreateUser`). No email or password is stored
  in Postgres.

## Who may do what: one access policy

`can(subject, action, resource?)` in `shared/utils/access.ts` decides every
access question, on the server and in the browser. It is pure and returns a
boolean. `subject` is `null` for a visitor, otherwise `{ id, roles }`.
Actions are named `resource.verb` (`collection.update`, `list.read`,
`field.read`, `export.read`, `barcodes.review`, and so on, see `ACTIONS`).
An action with no rule is refused. Permissions are the union of what the
subject's roles grant and what the attribute rules allow. There are no deny
rules.

- **Roles** live in `users.roles text[]` (default `{user}`, not null). Every
  account holds `user`, stored like any other role. The owner and reviewers
  also hold `admin`, which today grants `barcodes.review` and nothing else. It
  does not read other people's private data or bypass ownership or
  visibility. `user` grants no actions itself (`ROLE_ACTIONS.user` is empty):
  basic permissions come from the attribute rules in `RULES`, which apply to
  any signed-in subject and don't look at roles. Roles are granted by hand in
  SQL, with no UI. A check constraint (`users_roles`) allows only known names
  and requires `user`.
- **Routes** call `authorize(event, action, resource?)` and use what it
  returns (`{ user, subject, claims }`). It answers 401 without a signed-in
  user and 404 when the policy refuses (never 403, so a refusal doesn't
  reveal that someone else's resource or a feature exists). Give it the
  resource when the action concerns a specific thing, or a loader such as
  `collectionOf(event)` or `itemOf(event)`. Leave it out for the user's own
  data. Public routes use `viewerOf(event)` (null for a visitor) and
  `assertCan(subject, action, resource)`. A route never compares roles or
  `owner_id` itself, and never reads `field.hidden` or `visibility` to decide
  access: data shaping asks `can(subject, 'field.read', ...)`.
- **Queries keep their `owner_id` scoping** as defence in depth. The SQL
  filter stays even when the policy has already said yes.
- **The browser** uses the same `can()` through `useAuth().can(action)` to
  show or hide things (the Barcodes tab). It only hides what the user
  couldn't use. The server still decides. `/api/me` returns the user's own
  `roles`, and public profile data never does.

To add an action: add it to `ACTIONS` and give it a rule in `RULES` (or list
it under a role in `ROLE_ACTIONS`), add its row to the table in
`access.test.ts`, then call `authorize` with it from the route.

To add a role: add it to `ROLES` and `ROLE_ACTIONS`, widen the check in a
migration (`users_roles`, keeping `user` required, with the data to grant it) and grant it by hand. A
role-granted action ignores who owns the thing (say `comment.hide` for a
moderator), so list it under the role and keep it out of `RULES`.

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
  ids from `playwright.config.ts`.
- Signed-in pages in E2E: `signInAs(page, { username })` from
  `e2e/support/session.ts` puts unsigned tokens where Amplify reads them
  and stubs `/api/me`. Only the browser is fooled (real routes reject the
  tokens), so stub every API call the page makes. See `e2e/shelf.spec.ts`. It covers redirects, links and error
  messages, not a successful sign-in.
- Real flows: test against the `dev` pool with a throwaway user created by
  `aws cognito-idp admin-create-user --message-action SUPPRESS` and
  `admin-set-user-password --permanent` (an `@example.com` address, so no
  email is sent), then delete it through the app. Never use a real person's
  email, and leave the pool as you found it.
- Cognito's default email sender allows about 50 emails a day. Fine for
  dev. Switch to SES before real sign-ups.
