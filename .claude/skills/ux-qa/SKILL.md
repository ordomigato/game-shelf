---
name: ux-qa
description: >
  Use when reviewing or finishing any change that adds or moves UI, a menu, a
  button, a page state or user-facing text, and when planning a feature's UX.
  A checklist of the UI and UX problems that reached the user before, so they
  are caught before review instead of after.
---

# UX QA

Lint and tests don't see a page with two menus or a switch with no switch.
Run this list before calling UI work done, and while planning a feature's UX,
before anything is built. Walk the real page, in the browser, as the owner
and as a visitor. Reading the diff is not enough.

## Inventory

- List every visible button and menu item on each page touched, once for the
  owner and once for a visitor. Write the list down.
- Each action appears once per page. If "Edit fields" shows up in two places,
  one of them goes.
- A page has one "..." menu, not one in the header and another at the table.
  Related actions (import and export, for example) stay together.
- Each piece of information is shown once per page. Check counts, totals,
  titles and statuses for a second copy elsewhere on the page.

## Consistency

- The same action looks and behaves the same everywhere it appears: same
  label, same icon, same order, same result.
- When a state applies to an action (full, disabled, already added), every
  place that offers the action shows it, not just one.
- One word for one thing. After a rename, grep the app, `en.json` and the
  e2e specs for the old word.

## States

- Check each: empty, loading, error, full or over a limit, and a signed-out
  visitor.
- Partial data is never shown as if it were complete. A table that fills in
  batch by batch must not offer sort, search or export "until loaded".
  Controls work on everything from the first click, or the work moves to the
  server.
- A disabled control says why, or isn't shown.
- Failures get a plain message and a way to retry, not a blank area.

## Clutter

- Count the top-level buttons. Each needs a reason to be there.
- The primary action gets a button. Rare actions (export, add by hand, edit
  fields, import) go in the page's "..." menu.
- If two buttons are equally prominent, ask which one the user wants most.
- Don't add a control "in case". Fewer controls with clear names beat more.

## Copy

- Follow `plain-language` and `i18n`.
- One hint per concept. Don't repeat the same hint under every field. Say it
  once, where it applies.
- Name only pages and features that exist. Check that every page or section
  the text points to is real, with that name, in the app today.
- Cut words. If a sentence works without a clause, drop the clause.
- Labels say what the control does, not how it works.

## Does it work

- Every control renders. A switch must show the switch, not only its label.
  Check after `shadcn-vue add` and a dev server restart.
- Every control does something, with the keyboard (tab order, focus ring,
  Enter and Escape) and with a screen reader label.
- Check at phone width (about 375px) and in light and dark.
- Walk the main flow end to end as a new user: arrive, do the task, leave and
  come back. Note every moment of "what now?".

## Lessons

Each of these shipped, or nearly did. Add a line when a new one is found.

- 2026-10: A page had two "..." menus, with "Edit fields" in both and
  import/export split between them.
- 2026-10: The game count ("2 games") showed twice on one page.
- 2026-10: A planned table filled in batch by batch while sort, search and
  export were disabled "until loaded". Controls must work on everything from
  the first click, or the work belongs on the server.
- 2026-10: Too many buttons. Rare actions (export, add by hand) sat as
  top-level buttons.
- 2026-10: New wording named a page that doesn't exist ("profile"), and old
  words ("shelf", "Wanted") survived a rename.
- 2026-10: A "Full" state showed in one Add to menu but not in the others for
  the same action.
- 2026-10: A hint was repeated under every field, and a switch rendered with
  only its label.
