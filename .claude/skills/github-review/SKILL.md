---
name: github-review
description: >
  Use whenever asked to look at a PR's review comments, checks, or
  conversation on GitHub for this repo, e.g. "I left a comment on the PR, go
  look". There is no `gh` CLI in this environment. This skill is the GitHub
  REST API over curl, which does the same job.
---

# Reading and acting on GitHub, without `gh`

`gh` isn't installed here. `curl` is, and `api.github.com` is reachable, so
talk to the REST API directly.

## Token

The user keeps a fine-grained personal access token in `$GH_TOKEN`, exported
from their shell profile. Every Bash call sources that profile, so it's just
there. Check before relying on it:

```bash
test -n "$GH_TOKEN" && echo "set" || echo "missing"
curl -s -H "Authorization: Bearer $GH_TOKEN" https://api.github.com/user \
  | grep -m1 '"login"'
```

The token needs `game-shelf` in its repository list, with **Pull requests:
Read and write** (and **Issues: Read and write** for `github-issues`). A 404
or "Resource not accessible by personal access token" on a call below
usually means the token covers other repos but not this one. The fix is to
edit the existing token's repository access on GitHub (Settings → Developer
settings → the token), not to make a new one. If `$GH_TOKEN` is missing,
say so plainly. Never ask the user to paste a token into chat or write one
into a file.

## Common calls

```bash
OWNER=ordomigato
REPO=game-shelf
AUTH=(-H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json")
```

**PR number for a branch:**

```bash
curl -s "${AUTH[@]}" \
  "https://api.github.com/repos/$OWNER/$REPO/pulls?head=$OWNER:<branch>&state=all" \
  | jq '.[] | {number, title, state}'
```

**Inline review comments** (on a line of the diff, which is usually what "I
left a comment" means):

```bash
curl -s "${AUTH[@]}" \
  "https://api.github.com/repos/$OWNER/$REPO/pulls/<number>/comments" \
  | jq '.[] | {id, path, line, body, in_reply_to_id}'
```

**General PR conversation:**

```bash
curl -s "${AUTH[@]}" \
  "https://api.github.com/repos/$OWNER/$REPO/issues/<number>/comments" \
  | jq '.[] | {user: .user.login, body}'
```

**Review state:**

```bash
curl -s "${AUTH[@]}" \
  "https://api.github.com/repos/$OWNER/$REPO/pulls/<number>/reviews" \
  | jq '.[] | {state, body}'
```

**Checks on the PR's head commit:**

```bash
SHA=$(curl -s "${AUTH[@]}" \
  "https://api.github.com/repos/$OWNER/$REPO/pulls/<number>" | jq -r '.head.sha')
curl -s "${AUTH[@]}" \
  "https://api.github.com/repos/$OWNER/$REPO/commits/$SHA/check-runs" \
  | jq '.check_runs[] | {name, status, conclusion}'
```

**Reply to an inline comment** (the comment's own `id`, not the PR number):

```bash
curl -s -X POST "${AUTH[@]}" \
  "https://api.github.com/repos/$OWNER/$REPO/pulls/<number>/comments/<comment_id>/replies" \
  -d '{"body": "..."}'
```

## What this doesn't change

Pushing code still goes through the normal `git` SSH remote. Issues are the
`github-issues` skill.

Never merge, close, or dismiss a review through the API unless the user
asked for that exact action in this conversation.
