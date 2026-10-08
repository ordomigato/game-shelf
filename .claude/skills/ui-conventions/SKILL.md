---
name: ui-conventions
description: >
  Conventions for building UI in this Nuxt project and for writing comments in
  any file. Use whenever adding or changing a Vue component, page, or layout,
  creating a UI primitive (button, input, dialog, tile, …), restyling the app,
  or writing or editing code comments anywhere in the repo.
---

# UI conventions

## Primitives live in `app/components/base/`

Buttons, inputs, dialogs and similar primitives are `Base*` components in
`app/components/base/`. Before styling a raw element inline in a page, use
or extend the existing `Base*` component. A new primitive has the same
shape: `<script setup lang="ts">`, typed `defineProps`, `v-model` through
`defineModel`, and variants as a prop rather than a separate component.

Restyling happens in shared CSS and its custom properties, not by forking a
component per page.

## Vue and Nuxt idiom

- `<script setup lang="ts">` only. No Options API, no Vuex. Shared state is
  a composable (`useState` or a module-level `ref`), not a store library,
  unless the user asks for one.
- Rely on Nuxt auto-imports (`ref`, `computed`, components by folder name).
  Don't add manual imports for them.
- Never touch the DOM by hand to show state. v1 wrote error messages with
  `innerHTML` and toggled classes with `classList`. That's both an XSS hole
  and invisible to Vue. Render from reactive state instead.
- Navigation uses `<NuxtLink>`, not `<a href>`, so routes stay client-side.
- Pages are server-rendered by default. Anything that needs the signed-in
  user waits for auth to resolve on the client and shows a loading state
  until then. Browser-only APIs (`window`, `localStorage`) belong in
  `onMounted`, a `.client.ts` plugin, or `<ClientOnly>`.
- Components never call server routes ad hoc. Data access goes through a
  composable in `app/composables/` that owns that resource.

## Comments describe mechanism, never status

Don't write comments about the state of the product, its history, or the
reasoning behind a decision. All of these are wrong:

- `this used to call the Heroku proxy`
- `replaces the old addGame cloud function`
- `TODO once uploads come back`
- `not wired up yet`

They go stale as soon as the product moves, they argue with a reader who
hasn't objected, and they turn source files into a changelog.

Comment what the code does and what a caller must know to use it safely.
Prefer no comment to a narrating one. A clear name beats a paragraph.

If a decision genuinely needs recording, it goes in a GitHub issue, never
beside the code.

Files copied from an upstream library keep their upstream contents. Don't
annotate them.
