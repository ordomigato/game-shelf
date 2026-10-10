---
name: plain-language
description: >
  Plain, simple English for any text this app shows to a reader: UI labels,
  buttons, placeholders, empty states, toasts, and error messages. No em
  dashes, no en dashes, no semicolons. Use whenever writing or editing
  user-facing text.
---

# Plain language

## The rule

Two punctuation marks are banned from user-facing text in this project: the
dash used as a sentence joiner (em dash, en dash) and the semicolon. They
read fine in a book. They read wrong in software, and they're hard to
translate well.

Write short sentences instead. Where a dash or a semicolon would join two
related clauses, do one of these:

- Split it into two plain sentences.
- Join the clauses with "and", "but", "so", or "because".
- Use a colon, if what follows directly explains what came before.

## Examples

Not this: "No results — try a different search."

This: "No results. Try a different search."

Not this: "Sign in to save games; it only takes a minute."

This: "Sign in to save games. It only takes a minute."

Not this: "NotAuthorizedException: Incorrect username or password."

This: "That email and password don't match."

## Error messages

Never show a raw Cognito, AWS or IGDB error string
(`NotAuthorizedException`, an HTTP status, a stack trace) to the user. Map known codes to a plain
sentence, and fall back to a generic "Something went wrong. Try again." for
the rest. Log the original to the console.

## Where this applies

- Every user-facing string: labels, buttons, placeholders, hints, dialog
  titles, confirmation prompts, empty states, error messages.
- Every message in `i18n/locales/en.json`, which is where all user-facing
  English lives (see `i18n`).
- New commit messages and pull request descriptions.

## Where this doesn't apply

Code comments and GitHub issue text follow the project's own prose style.
Don't rewrite existing text to satisfy this rule.
