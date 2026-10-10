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

GameShelf lets people build their own game collections and share them.
Each collection has columns the user defines (a collector tracks price and
quantity, a player tracks console and progress), and IGDB search only
pre-fills new items. Users own their data. Public collections can be
browsed by others, with posts and comments planned around them. `main` is v3, a clean rewrite with no
shared history. The `v1` tag holds the original (Nuxt 2, Heroku, Firebase)
and the `v2` branch an abandoned Netlify attempt. Read them for behavior
with `git show v1:<path>`, but don't port their architecture.

## Settled decisions

Don't re-litigate these inside a task. If one has to move, raise it with the
user first.

- **Nuxt 4, deployed to AWS with SST.** CloudFront in front, Nuxt's server
  (Nitro) running in Lambda, static assets in S3. Infrastructure lives in
  `sst.config.ts` and nowhere else. No clicking resources into existence in
  the console.
- **Nuxt server routes are the backend.** `server/api/` is where anything
  secret or privileged happens: IGDB calls (see `igdb`) and every database
  read and write. The browser never talks to the database directly.
- **Cognito for accounts.** The browser signs in with Amplify against
  Cognito and sends its access token to server routes, which verify it with
  `requireAuth` and take the user only from the verified token. Pages that
  depend on the signed-in user render in the browser only. See `auth`.
- **Postgres on Neon, through Drizzle.** Neon is serverless Postgres: free
  at this scale, sleeps when idle, no VPC needed. Each SST stage has its
  own Neon branch, reached through the `DatabaseUrl` secret. Relational
  tables for users, collections, posts and comments. The user-defined
  columns live in JSONB (`collections.fields` holds the definitions,
  `items.data` the values). See `postgres-change`.
- **Not DynamoDB, not Aurora DSQL, not RDS.** DynamoDB was dropped because
  the social features are relational. DSQL has no JSONB. RDS and
  self-hosted Postgres cost more than the whole budget.
- **No profile pictures.** Dropped on purpose. Don't add file uploads.
- **v3 starts with no data from v1.** Nothing is migrated from Firebase
  unless the user asks.
- **Budget: aim for $0, never more than $5 a month.** See the cost rules
  below.

## Cost rules

The account has a budget alert. These keep it quiet:

- Stay inside the always-free tiers: Lambda, CloudFront, Cognito, and
  Neon's free plan (1 GB storage, 100 compute-hours a month).
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
