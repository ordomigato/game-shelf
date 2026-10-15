---
name: orchestration
description: >
  Use when a request has several pieces of work, or one big piece that splits
  cleanly, and the user wants it done with agents. Claude is the
  orchestrator: it plans, splits the work so agents don't collide, briefs
  each agent fully, reviews what comes back, and is the only one that talks
  to the user, pushes or opens PRs. Covers which agent to use for what, how
  to keep agents' files and test runs apart, and what an agent's report
  must contain.
---

# Orchestrating agents

The user asked (2026-10-15) for Claude to work as the orchestrator from now
on: plan the work, hand pieces to agents suited to them, and stay the one
voice the user deals with. Refine this file as we learn what works. Add a
dated line under "Lessons" when something goes wrong or works well.

## The orchestrator's job

1. **Plan first, in the main conversation.** Settle the decisions that are
   the user's (AskUserQuestion) before spawning anyone. An agent can't ask
   the user, so it must not be the one to meet an open question.
2. **Split by files, not by topic.** Two agents must never edit the same
   file. If two pieces of work need the same file (often `sst.config.ts`,
   `i18n/locales/en.json`, `shared/types/collection.ts`,
   `app/composables/useCollections.ts`), run them one after the other, or
   give one agent both. Every split gives each agent a list of the files
   that are its own.
3. **One PR per agent, each against main.** Never stack branches (see
   memory: no stacked PRs). If B needs A's work, wait for A to merge, then
   start B from the new main.
4. **Brief completely.** The agent starts with none of this conversation.
   Give it everything it needs (see "The brief" below).
5. **Review before anything leaves.** Read the diff an agent made. Rerun the
   checks yourself when the change is risky. Then push and open the PR
   yourself, following `pr-conventions`. Agents never push, open PRs,
   deploy, run `sst dev`, set secrets or touch production.
6. **Tell the user what each agent did**, in plain words, with what was and
   wasn't verified. Never pass on a report you haven't checked.

## When not to spawn

- Small changes (a few lines, one or two files): do them directly.
- Anything that needs the user mid-way (UI they need to look at on their
  `sst dev`, choices, secrets, AWS sign-in): keep it in the main
  conversation.
- Work that depends on something not yet merged.

## Which agent

| Work                                                     | Agent                                      | Notes                                                             |
| -------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------- |
| Find where something lives, map a pattern across the app | `Explore`                                  | Read-only. Say how thorough ("medium", "very thorough").          |
| Design an approach for something big before building it  | `Plan`                                     | Read-only. Ask for files to change, order, risks.                 |
| Build a change and test it                               | `general-purpose`, `isolation: "worktree"` | Gets its own git worktree, so it can't touch the user's checkout. |
| Look things up online (provider docs, limits, prices)    | `general-purpose`                          | Ask for sources.                                                  |

Run agents in the background unless the very next step needs the answer.
Run independent agents in parallel, in one message.

## Keeping parallel agents apart

- **Files:** each agent works in its own worktree (`isolation:
"worktree"`) and owns the files listed in its brief.
- **Builds and tests:** never in the user's main checkout (it's under their
  running `sst dev`). In a worktree, the build picks up the wrong
  `node_modules`, so each agent verifies in its own copy outside the repo:
  ```bash
  V=<scratchpad>/verify-<branch>          # one per agent
  [ -d "$V" ] || cp -cR <scratchpad>/verify "$V"   # fast copy-on-write clone
  rsync -a --delete --exclude node_modules --exclude .git --exclude .output \
    --exclude .nuxt --exclude .sst --exclude .claude/worktrees ./ "$V"/
  cd "$V" && npm run lint && npm run format:check && npm test && \
    npm run typecheck && npm run build && \
    NITRO_PRESET=node-server npx nuxt build && \
    E2E_PORT=<unique> npx playwright test --reporter=line
  ```
  Give each agent its own `E2E_PORT` (3101, 3102, …). The e2e config reuses
  any server already on its port, so two agents on one port would test each
  other's code without noticing.
- **AWS and databases:** agents don't run `sst` commands, migrations or
  anything against dev or production. If a change needs a migration, the
  agent writes it (`npx drizzle-kit generate` in its verify copy) and the
  orchestrator applies it to dev after review.

## The brief

Every agent prompt includes:

- **Goal and why**, in a few sentences, with the user's decisions quoted.
- **The branch name** to create (`feat/…`, `fix/…`), from `main`.
- **Files it owns**, and files it must not touch.
- **Project rules to follow:** read `CLAUDE.md` if present and the relevant
  skills under `.claude/skills/` (always `release-gate`,
  `commit-conventions`, `plain-language`, `i18n`, `ui-conventions`; plus
  `postgres-change`, `auth`, `igdb`, `aws-infra` when they apply). Match the
  surrounding code's style and comment density.
- **How to verify:** the block above, with its own `verify-<branch>` folder
  and `E2E_PORT`.
- **Commit, don't push.** Conventional commits, ending with the
  co-author line from the session's attribution rules.
- **What to report back:** the branch and commit(s); what changed, file by
  file, in a sentence each; the check results with numbers (unit and e2e
  counts); anything not done or not verified; decisions it had to make,
  and why; follow-ups it noticed.

## After an agent reports

1. `git log` and `git diff main...<branch>` on its branch. Read the diff.
2. Rerun the checks when the change is risky, or if the report is vague.
3. Apply any migration to dev (`npm run db:migrate`) only after reading it.
4. Push and open the PR (or hand the branch to the user to try first, when
   it's UI they review on their `sst dev`).
5. Clean up: remove the agent's worktree once its branch is pushed.

## Lessons

- 2026-10-15: started. The e2e port was fixed at 3100, so `E2E_PORT` was
  added for parallel agents.
