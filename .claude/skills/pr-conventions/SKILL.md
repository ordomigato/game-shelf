---
name: pr-conventions
description: >
  How to write a pull request body for this repo. No "Test plan" checklist,
  no "Generated with Claude Code" footer or badge. Use whenever opening a PR
  against this repo through the GitHub API.
---

# Pull request conventions

## The rule

Keep the PR body to a short description of what changed and why. Nothing
else.

Leave out:

- A "Test plan" section or checklist. The `release-gate` checks already ran
  before the PR went up, and restating them as checkboxes is noise.
- The "🤖 Generated with Claude Code" footer or badge.

Those are Claude Code's own defaults for PR bodies. This skill overrides
them for this repo.

## What a PR body looks like

A summary in the same voice as a commit message: what changed and why, not
a restatement of the diff. A few bullet points at most. If the title says
it all, a one-line body is fine.

If the change adds an AWS resource, say what it costs at this scale (see
`project-context`). That's part of the "why", not a checklist.

Not this:

```
## Summary
- Added wishlist composable
- Added star button to GameTile

## Test plan
- [x] npm run typecheck
- [x] npm run lint

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

This:

```
A star on each search result adds the game to the wishlist. Owned and
wishlisted games are mutually exclusive, so adding to one removes it from
the other.

Closes #4
```

## Name the issue

Reference the issue the PR works on: `Closes #4` when it finishes it,
`Towards #4` or a bare `#4` when it doesn't. The `github-issues` skill
covers the difference.

## Base branch

PRs target `main`.

## Where this doesn't apply

Commit messages keep their `Co-Authored-By` trailer. This skill is about
the PR body only.
