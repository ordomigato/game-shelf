# GameShelf

Search IGDB, keep track of the games you own and the ones you want.

Nuxt 4 on AWS. Requires Node 24 (`nvm use`).

## Commands

```bash
npm install
npx sst install        # SST providers and types, needed by typecheck
npx sst dev            # Nuxt on :3000, linked to your personal AWS stage
npm run typecheck
npm run lint
npm run format:check
npm run build
```

## Infrastructure

Everything on AWS is defined in `sst.config.ts`. One-time setup per stage:

```bash
npx sst secret set TwitchClientId <id>
npx sst secret set TwitchClientSecret <secret>
```

Production also needs `npx sst secret set BudgetAlertEmail <email> --stage production`.
Deploy with `npx sst deploy --stage production`.

Commits follow `type(scope): subject` and are checked by a commit hook.
