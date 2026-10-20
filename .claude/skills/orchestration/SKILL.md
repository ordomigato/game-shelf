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

## Keep token use down

The user asked (2026-10-15) to cut usage. Every agent starts from zero and
reads the skills and many files before writing anything (100k+ tokens for a
build), so:

- **Pick the model per agent** with the Agent tool's `model`: `haiku` for
  read-only searches (`Explore`), `sonnet` for builders and research. Keep
  the main model only for design work where judgement matters (`Plan` on a
  big change).
- **Small jobs stay small.** A small change still goes to a `builder`,
  but with a few-line brief and no planner. Skip the `Plan` agent whenever
  the design is already clear, and skip the reviewer only for docs-only
  changes.
- **Short briefs.** Point to the skills by name instead of restating them.
  Give the goal, the decisions, the files owned, the branch and the port;
  the skills cover the rest.
- **Lean reports.** Ask for changed files and results in a few lines, not
  essays.
- **Long sessions are expensive:** every reply re-reads the conversation.
  Suggest a fresh session per feature; the plan, memory and skills carry
  the context.

## Everything goes to an agent

The user asked (2026-10-15) that the orchestrator only orchestrate: every
task, small ones too, goes to the agent made for it. The orchestrator
itself only:

- talks to the user and asks for their decisions;
- writes briefs and reads reports;
- pushes branches and opens or updates PRs;
- applies reviewed migrations to dev and checks SQL there (agents can't
  reach AWS);
- keeps `PLANNING.local.md` current: tick an item (`- [x]`, with the PR
  number) when its PR is opened or merged, and add new decisions as they're
  made.

Still keep in the main conversation anything that needs the user mid-way:
choices, secrets, AWS sign-in, and UI they check on their `sst dev`.

## Which agent

| Work                                          | Agent                                                            | Notes                                                                                |
| --------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Build or change code, tests, migrations, docs | `builder` (`.claude/agents/builder.md`), `isolation: "worktree"` | Sonnet. Knows the check commands and commit rules, so the brief only needs the task. |
| Review a finished branch before it's pushed   | `reviewer` (`.claude/agents/reviewer.md`)                        | Sonnet, read-only. Ranked findings; send fixes back to a builder.                    |
| Design UI/UX options to compare               | `designer` (`.claude/agents/designer.md`)                        | Sonnet. Mockups on a design canvas, no app changes.                                  |
| Find where something lives, map a pattern     | `Explore`, `model: "haiku"`                                      | Read-only. Say how thorough.                                                         |
| Design the approach for a big change          | `Plan`                                                           | Read-only, main model. Only when the design isn't clear yet.                         |
| Look things up online                         | `general-purpose`, `model: "sonnet"`                             | Ask for sources.                                                                     |

Run agents in the background unless the very next step needs the answer.
Run independent agents in parallel, in one message.

## Keeping parallel agents apart

- **Files:** each agent works in its own worktree (`isolation:
"worktree"`) and owns the files listed in its brief.
- **Builds and tests:** never in the user's main checkout (it's under their
  running `sst dev`). In a worktree, the build picks up the wrong
  `node_modules`, so each agent verifies in its own copy outside the repo:
  The `builder` agent's instructions (`.claude/agents/builder.md`) give
  the exact commands: a copy per branch under
  `/Users/jeremy/.cache/game-shelf-verify/`, cloned from `base` there.
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
  `commit-conventions`, `plain-language`, `i18n`, `ui-conventions`, and
  `ux-qa` for UI work; plus
  `postgres-change`, `auth`, `igdb`, `aws-infra` when they apply). Match the
  surrounding code's style and comment density.
- **How to verify:** smoke tests while working (see `release-gate`, "When
  to run what"), then the block above **once** at the end, with its own
  `verify-<branch>` folder and `E2E_PORT`.
- **Commit, don't push.** Conventional commits, ending with the
  co-author line from the session's attribution rules.
- **What to report back:** the branch and commit(s); what changed, file by
  file, in a sentence each; the check results with numbers (unit and e2e
  counts); anything not done or not verified; decisions it had to make,
  and why; follow-ups it noticed.

## After a builder reports

1. Send the branch to a `reviewer`. If it finds real problems, send them
   back to a builder on the same branch, then review again.
2. Rerun checks only when something is in doubt. The builder's full run
   counts.
3. Apply any migration to dev (`npm run db:migrate`) only after reading it.
4. Push and open the PR (or hand the branch to the user to try first, when
   it's UI they review on their `sst dev`).
5. Clean up: remove the agent's worktree once its branch is pushed.
6. Tick the item in `PLANNING.local.md` with the PR number.

## Lessons

- 2026-10-15: started. The e2e port was fixed at 3100, so `E2E_PORT` was
  added for parallel agents.
- 2026-10-15: the user asked for fewer full test runs. Agents run smoke
  tests while working and the full set once at the end.
- 2026-10-15: a verify copy's `.sst/platform` can go stale (the typecheck
  then fails on `process` in `infra/`). Refresh it with
  `rsync -a --delete <repo>/.sst/platform/ <copy>/.sst/platform/`; it's not
  the change's fault.
