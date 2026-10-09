---
name: ui-conventions
description: >
  Conventions for building UI in this Nuxt project and for writing comments in
  any file. Use whenever adding or changing a Vue component, page, or layout,
  installing or creating a UI primitive (shadcn-vue), restyling the app,
  or writing or editing code comments anywhere in the repo.
---

# UI conventions

## Primitives come from shadcn-vue

Never hand-roll a UI primitive (button, input, dialog, dropdown, table,
toast…). If shadcn-vue has it, install it:

```bash
npx shadcn-vue@2.8.2 add <component>
```

It lands in `app/components/ui/` and is auto-imported. Keep it exactly as
shadcn-vue ships it: don't rename props, restructure, or wrap it in a
bespoke abstraction. Those files (and `app/lib/utils.ts`) are excluded from
ESLint and Prettier for that reason. Only write a component by hand when
the registry has nothing equivalent, and then follow the shadcn shape:
`cva` variants, `cn()` class merging, props that extend the native
element's.

## The look lives in the theme

GameShelf must not look like stock shadcn. Restyle through the theme in
`app/assets/css/tailwind.css` (colours, `--radius`, fonts, the `--masthead`
and `--shelf` tokens), never by editing a component. The palette comes from
GameShelf v1: steel blue `#3D6F94` (primary), navy `#001F44` (masthead,
dark mode), sky blue `#76BDF2` (accents, dark-mode primary), grey
`#A0AEC0` (muted text in dark mode). Exo 2 for headings and Outfit for
text, for a game-friendly but readable feel. The longer-term direction is
a collector's shelf: signature pieces (the steel-blue shelf edge under the
navy header, later the shelf view and generated covers) are our own
components in `app/components/`.

After any `shadcn-vue add`, check `git diff app/assets/css/tailwind.css`.
The CLI can rewrite that file. It has re-added a Google Fonts `@import`,
a `--font-heading: var(--font-sans)` line that silently overrides the
heading font, and a duplicate `@layer base`. Fonts are self-hosted by
`@nuxt/fonts`, so no stylesheet should ever load from Google.

Themes are switched in the header (`ThemeSwitcher`) through
`@nuxtjs/color-mode`, which puts the chosen theme's id as a class on
`<html>` and remembers it in the browser. The list lives in
`app/utils/themes.ts`: System, Light (`:root` variables) and Dark (`.dark`
variables). Every colour comes from a theme variable, so new UI works in
every theme. Check new UI in at least light and dark.

To add a theme: add an entry to `themes.ts`, and a block of the same
variables under its class in `tailwind.css`. A dark-based theme also needs
the `dark` variant to apply (the `@custom-variant dark` rule), so plan for
that when the first one lands.

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
