---
name: github-issues
description: >
  Use when creating, labelling, closing or triaging GitHub issues for this
  repo, or when opening a PR that should close or reference one. Covers the
  curl workflow (no `gh` CLI), the area labels, and how to link a PR to its
  issue so GitHub closes it on merge.
---

# Creating and managing issues, without `gh`

Same setup as `github-review`: `$GH_TOKEN` from the user's shell profile,
which also needs **Issues: Read and write** on this repo.

```bash
OWNER=ordomigato
REPO=game-shelf
AUTH=(-H "Authorization: Bearer $GH_TOKEN" -H "Accept: application/vnd.github+json")
```

Creating, closing, or labelling an issue is visible to anyone watching the
repo. Do it when the user asked for issue work, and say what you created.

## Labels

One area label per part of the app: `search`, `library`, `account`,
`api` (Nuxt server routes), `infra` (SST, AWS resources, tooling). Plus GitHub's defaults: `bug`, `enhancement`, `question`,
`documentation`. A `question` issue is an open decision for the user, not a
task.

Check what exists before using a label. Create a missing area label rather
than inventing a new one:

```bash
curl -s "${AUTH[@]}" "https://api.github.com/repos/$OWNER/$REPO/labels" | jq '[.[].name]'
curl -s -X POST "${AUTH[@]}" "https://api.github.com/repos/$OWNER/$REPO/labels" \
  -d '{"name": "library", "description": "Owned games and wishlist", "color": "1d76db"}'
```

Keep a label description to a short phrase.

## Creating an issue

```bash
curl -s -X POST "${AUTH[@]}" "https://api.github.com/repos/$OWNER/$REPO/issues" \
  -d '{"title": "...", "body": "...", "labels": ["library"]}' | jq '{number, html_url}'
```

No id prefix in the title. The issue number is the id. The body is the task
in full. Cross-references are real `#<number>` links.

## Listing

```bash
curl -s "${AUTH[@]}" "https://api.github.com/repos/$OWNER/$REPO/issues?labels=library&state=open" \
  | jq '.[] | select(.pull_request | not) | {number, title}'
```

The issues endpoint also returns PRs. The `select` filters them out.

## Closing

```bash
curl -s -X PATCH "${AUTH[@]}" "https://api.github.com/repos/$OWNER/$REPO/issues/<number>" \
  -d '{"state": "closed", "state_reason": "completed"}'
```

Use `"completed"` for done work and `"not_planned"` for work decided
against.

## Linking a PR to its issue

GitHub reads the link from plain text. `Closes #12`, `Fixes #12` or
`Resolves #12` in a PR body closes the issue when the PR merges into
`main`, the default branch. A PR into any other branch links the issue
without closing it.

Use `Towards #12` or a bare `#12` for partial progress. `pr-conventions`
covers the rest of the PR body.
