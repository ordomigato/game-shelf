---
name: release-gate
description: >
  Use before telling the user a change is done, ready to commit, or ready for
  a PR. Runs the checks this project has (typecheck, lint, format, build) and
  the manual checks it needs because there are no automated tests yet, so
  "done" means verified rather than claimed.
---

# The gate before calling anything done

Use Node 24 (`nvm use`). On a fresh clone, run `npx sst install` once so
the SST types `typecheck` relies on exist. Then:

```bash
npm run typecheck      # nuxi typecheck (vue-tsc), then sst.config.ts
npm run lint           # @nuxt/eslint with strict typescript-eslint rules
npm run format:check   # prettier
npm run build          # full Nuxt build
```

The commit hook runs eslint and prettier on staged files only, and checks
the commit message. It doesn't run typecheck or the build, so run those
yourself.

There's no unit or e2e test suite and no CI yet. Don't claim one ran. If a
change would clearly benefit from a test, say so and offer to add the
tooling rather than quietly skipping it.

## What counts as passing

- `typecheck`, `lint`: zero errors. The project starts with none, so any
  error is new, even in a file the change didn't touch.
- `format:check`: clean, or run `npm run format` first.
- `build`: completes.

## Check it in the running app

Exercise the change in the browser with `npm run dev`, or `npx sst dev`
once infrastructure exists, so server routes can reach real AWS resources.
The page loads, the network tab shows the expected `/api/` call, and the
console has no errors. For anything behind sign-in, check both the
signed-in and signed-out paths. For a server route, confirm the response
never includes a secret or token.

## Infrastructure changes

`sst.config.ts` changes get checked with the typecheck above, plus a
`npx sst diff` against the target stage when AWS credentials are
available. `sst deploy` and `sst remove` change real resources and can cost
money, so ask before running either.

## If something fails

Fix the root cause. Don't add `// @ts-ignore` or an `eslint-disable`
comment, don't loosen a type to `any`, and don't use `--no-verify` to get a
commit through. Each of those just moves the failure to whoever hits it
next.
