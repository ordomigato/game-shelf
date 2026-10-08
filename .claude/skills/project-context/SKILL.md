---
name: project-context
description: >
  Use at the start of any task in this repo, especially in a fresh session
  with no prior conversation to draw on. States the architecture and cost
  constraints every change must respect (Nuxt 4 on AWS through SST, a budget
  of a few dollars a month at most), where the app's data lives, and where
  pending work is tracked, instead of re-deriving them or guessing.
---

# Where this project keeps its own context

GameShelf is a personal game catalog: search IGDB, mark games as owned or
wishlisted, and keep a basic account. The `v3` branch is a clean rewrite.
`master` holds v1 (Nuxt 2, Heroku, Firebase) and `v2` holds an abandoned
Netlify attempt. Read them for behavior with `git show master:<path>`, but
don't port their architecture.

## Settled decisions

Don't re-litigate these inside a task. If one has to move, raise it with the
user first.

- **Nuxt 4, deployed to AWS with SST.** CloudFront in front, Nuxt's server
  (Nitro) running in Lambda, static assets in S3. Infrastructure lives in
  `sst.config.ts` and nowhere else. No clicking resources into existence in
  the console.
- **Nuxt server routes are the backend.** `server/api/` is where anything
  secret or privileged happens: IGDB calls (see `igdb`) and every DynamoDB
  read and write. The browser never gets AWS credentials of its own and
  never talks to DynamoDB directly.
- **Cognito for accounts.** The browser signs in with Cognito and sends its
  ID token to server routes. A server route verifies that token before
  touching user data and takes the user id from the verified token, never
  from the request body.
- **DynamoDB for data.** One table for the library, keyed by user and game.
- **No profile pictures.** Dropped on purpose. Don't add file uploads.
- **v3 starts with no data from v1.** Nothing is migrated from Firebase
  unless the user asks.
- **Budget: aim for $0, never more than $5 a month.** See the cost rules
  below.

## Cost rules

The account has a budget alert. These keep it quiet:

- Stay inside the always-free tiers: Lambda, DynamoDB on-demand at this
  scale, CloudFront, Cognito.
- Never add a NAT Gateway, RDS, ElastiCache, a load balancer, or anything
  else billed per hour just for existing. Each costs more than the whole
  monthly budget.
- Keep Lambda reserved concurrency capped so a flood of requests can't run
  up a bill.
- Prefer SSM Parameter Store (standard tier, free) or SST secrets over
  Secrets Manager ($0.40 per secret per month).
- When a change adds a new AWS resource, say what it costs at this scale in
  the PR description.

## Secrets

`TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET` are server-only. Never put them
in `runtimeConfig.public`, never prefix them with `NUXT_PUBLIC_`, and never
return them or an IGDB access token from a server route. Locally they come
from `.env` (see `.env.example`).

## Tracking work

Work is tracked as [GitHub issues](https://github.com/ordomigato/game-shelf/issues),
one per task. Check them before starting unscoped work, and open an issue
rather than quietly expanding scope. There's no `gh` CLI here. The
`github-issues` and `github-review` skills cover the curl workflow.

## Comments describe mechanism, never history

Covered in full in `ui-conventions`. Load it before writing or reviewing a
comment.
