# GameShelf

Build your own game collections, with the columns you care about, and share them.
IGDB search fills in the details.

Nuxt 4 on AWS. Requires Node 24 (`nvm use`).

## Commands

```bash
npm install
npx sst install        # SST providers and types, needed by typecheck
npx sst dev --stage dev   # Nuxt on :3000, connected to the dev stage in AWS
npm run typecheck
npm run lint
npm run format:check
npm run build
```

## Infrastructure

Everything on AWS is defined in `sst.config.ts`. There are two stages, each a
separate copy of the whole app: `dev` for development and `production` for the
live site. SST signs in with the `gameshelf` AWS CLI profile
(`aws sso login --profile gameshelf`).

One-time setup per stage:

```bash
npx sst secret set TwitchClientId <id> --stage dev
npx sst secret set TwitchClientSecret <secret> --stage dev
npx sst secret set DatabaseUrl <neon connection string> --stage dev
```

Production also needs `npx sst secret set BudgetAlertEmail <email> --stage production`.
Deploy with `npx sst deploy --stage production`.

## Database

Postgres on [Neon](https://neon.tech), one Neon branch per stage, with
[Drizzle](https://orm.drizzle.team). The schema is in `server/db/schema.ts`.

```bash
npm run db:generate -- --name <change>   # write a migration from the schema
npm run db:migrate                        # apply migrations to dev
npm run db:studio                         # browse the dev database
```

Commits follow `type(scope): subject` and are checked by a commit hook.
