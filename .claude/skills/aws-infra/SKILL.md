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

Resource.Library.name // DynamoDB table name
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

SST signs in with the `gameshelf` profile in `~/.aws/config` (an IAM
Identity Center login). If a command fails on credentials, the session
expired: `aws sso login --profile gameshelf`.

Secrets are per stage: `npx sst secret set <Name> <value> [--stage x]`,
or `--fallback` to set a default for every stage.

## Cost guardrails

Before adding a resource, check `project-context`'s cost rules. Specifically
here:

- Lambda: arm64 (cheaper per GB-second), 512 MB, log retention 1 week, and
  production reserved concurrency of 5. Don't raise them without a reason.
  A brand-new AWS account can have a concurrency quota of 10, and AWS
  refuses a reservation that leaves fewer than its minimum unreserved. If a
  deploy fails on that, ask the user to request a quota increase rather
  than removing the cap.
- DynamoDB on-demand (SST's default). Don't switch to provisioned capacity.
- No `provisioned` concurrency, no VPC, no NAT, no RDS.
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
