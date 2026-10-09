---
name: commit-conventions
description: >
  Use whenever writing a git commit message or naming a branch in this repo.
  Covers the type(scope): subject format, how the commit hook enforces it,
  and the branch-naming convention.
---

# Commit messages and branch names

## The format

```
type(scope): subject
```

`scope` is optional and freeform: any short word naming what the commit
touches (`search`, `library`, `auth`, `api`, `infra`, `deps`). `type` is one of:

```
feat fix docs style refactor perf test build ci chore revert
```

Everything after the subject line explains why, not what. Write it as plain
prose wrapped by hand, not a bullet list of file changes. The
`plain-language` skill applies.

## Enforcement

A husky `commit-msg` hook runs commitlint (`commitlint.config.cjs`, based on
`@commitlint/config-conventional`) and rejects a malformed message before
the commit is made. A `pre-commit` hook runs eslint and prettier on staged
files through lint-staged. There's no CI yet, so the local hooks are the
only check. Never bypass them with `--no-verify`.

Commits in the archived `v1` tag and the `v2` branch predate the
convention, so don't copy their style.

## Examples

```
feat(library): add games to a wishlist

A star on each search result saves the game to the signed-in user's
wishlist in DynamoDB. Adding a wishlisted game to owned games takes it
off the wishlist.
```

```
chore: bump nuxt to the latest minor
```

## Branch names

`type/description`, no scope: `feat/wishlist`, `fix/search-escaping`,
`chore/skills`. Scanning a branch list should show at a glance what kind of
change each one is.
