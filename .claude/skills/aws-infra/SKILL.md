---
name: aws-infra
description: >
  Use whenever editing sst.config.ts, adding or changing an AWS resource,
  linking a resource to the Nuxt app, setting secrets, or running any `sst`
  command (dev, diff, deploy, remove). Covers how resources reach server
  code, stage rules, cost guardrails, and which commands need the user's
  go-ahead.
---

# Infrastructure with SST

Everything on AWS is declared in `sst.config.ts`. SST v4 runs on Pulumi, so
`aws.*` (the Pulumi AWS provider) is available there for anything SST has no
component for, like the budget.

## How resources reach server code

Add a resource to the Nuxt component's `link` array, then read it in
`server/` code through `Resource`:

```ts
import { Resource } from 'sst'

Resource.DatabaseUrl.value // Neon connection string (secret)
Resource.TwitchClientSecret.value // secret value
Resource.Users.id // Cognito user pool id
Resource.WebClient.id // user pool client id
```

Linking also grants the Lambda the IAM permissions for that resource. Never
hardcode a table name, ARN or pool id, and never import `sst`'s `Resource`
in `app/` code. It only exists on the server.

Values the browser needs (the Cognito pool id and client id) go through the
component's `environment` as `NUXT_PUBLIC_*` and map onto
`runtimeConfig.public` in `nuxt.config.ts`. Only public identifiers go
there, never a secret.

## Stages

- `production`: the real site. `protect` and `removal: retain` stop
  `sst remove` from deleting data, and the table has deletion protection.
  The budget lives only here because AWS budgets are account-wide.
- `dev`: the development copy, used by `npx sst dev --stage dev`.
  Disposable. `npx sst remove --stage dev` wipes it.

Always pass `--stage` explicitly. Without it, SST falls back to the local
`.sst/stage` file, or the Mac username on a fresh clone, and quietly
creates a third copy.

Each project gets its own AWS account under the user's AWS Organization.
ThisPlayShelf lives in the `gameshelf` account (787391403512, named before the rename). The management
account (`jeremy-personal`) holds billing and the organization only, so
don't deploy anything there. SST signs in with the `gameshelf` profile in
`~/.aws/config` (an IAM Identity Center login). Set `AWS_PROFILE` to aim one
command at another account. If a command fails on credentials, the session
expired: `aws sso login --profile gameshelf`.

Secrets are per stage: `npx sst secret set <Name> <value> [--stage x]`,
or `--fallback` to set a default for every stage.

## Cost guardrails

Before adding a resource, check `project-context`'s cost rules. Specifically
here:

- Lambda: arm64 (cheaper per GB-second), 1024 MB (faster cold starts, #36), log retention 1 week, and
  production reserved concurrency of 5. Don't raise them without a reason.
  A brand-new AWS account can have a concurrency quota of 10, and AWS
  refuses a reservation that leaves fewer than its minimum unreserved. If a
  deploy fails on that, ask the user to request a quota increase rather
  than removing the cap.
- No `provisioned` concurrency, no VPC, no NAT, no RDS.
- **The ceiling is about a dollar a month:** the user would rather the site
  go offline than pay more. CloudFront is **pay-as-you-go**. The flat-rate
  Free plan isn't available, because SST's Nuxt setup uses custom cache
  policies and an edge key-value store (Pro, $15/month). Costs stay near
  zero through the always-free allowances (CloudFront 1 TB and 10M
  requests, Lambda 1M requests a month), the concurrency cap and the
  kill switch below.
- **Kill switch** (production): five CloudWatch alarms on CloudFront
  requests (50k/hour, 300k/day), CloudFront bytes (20 GB/day) and server
  invocations (20k/hour, 30k/day) publish to the `TrafficAlarms` topic.
  `infra/kill-switch.ts` then sets the server's reserved concurrency to 0
  and disables the distribution, and the topic emails the budget address.
  **To bring the site back, re-run the latest deploy** (Actions → Deploy →
  re-run, or publish a new release): it restores both. Raise a threshold in
  `sst.config.ts` if real traffic grows toward it, and keep the daily ones
  inside the free allowance.
- Say what a new resource costs at this scale in the PR.

## Commands

| Command                    | Safe to run without asking?                                    |
| -------------------------- | -------------------------------------------------------------- |
| `npx sst install`          | Yes. Installs providers and regenerates `.sst/platform` types. |
| `npm run typecheck`        | Yes. Includes `tsc -p tsconfig.sst.json` for this file.        |
| `npx sst diff --stage <s>` | Yes, read-only. Needs AWS credentials.                         |
| `npx sst dev`              | Ask. Creates real resources in a personal stage.               |
| `npx sst deploy`           | Ask. Changes real resources and can cost money.                |
| `npx sst remove`           | Ask, every time. Deletes resources.                            |
| `npx sst secret set`       | Ask. The user supplies the value, never paste it into chat.    |

## Production deploys

Production deploys from GitHub Actions (`.github/workflows/deploy.yml`)
when the user pushes a version tag (`v1.2.0`; releases start at `v1.0.0`) on a commit on `main`, or
publishes a release with one. Merging to `main` doesn't deploy. The job
migrates the database, runs `sst deploy`, then smoke-tests the site.
Migrations run before the new code, so they must stay additive.

GitHub signs in to AWS as the IAM role `game-shelf-github-deploy`, through
GitHub's OIDC provider. The user created both by hand in the IAM console,
outside `sst.config.ts`. The role only trusts jobs in this repo's GitHub
`production` environment, which only `v*.*.*` tags can use.

## Domain

Production answers on `thisplayshelf.com`. `www` is an alias on the same
distribution, and `server/middleware/www-redirect.ts` redirects it to the
bare domain. Don't switch to SST's `redirects`: it creates a second
CloudFront distribution, which the kill switch doesn't watch.
DNS is at Namecheap, not Route 53, so SST creates no DNS records
(`dns: false`). The ACM certificate (us-east-1) was validated by hand with
CNAME records at Namecheap, and its ARN is in `sst.config.ts`. At Namecheap,
an ALIAS on `@` and a CNAME on `www` point at the production CloudFront
distribution. If the distribution is ever replaced, update those two
records. Production builds set `NUXT_PUBLIC_SITE_URL`, which canonical links
and link previews use.
