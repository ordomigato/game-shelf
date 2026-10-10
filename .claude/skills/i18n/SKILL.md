---
name: i18n
description: >
  Use whenever adding or changing any text a user sees (labels, buttons,
  headings, messages, aria-labels, alt text, page titles, errors), or when
  adding a language. All user-facing text goes through @nuxtjs/i18n, with
  English in i18n/locales/en.json as the source.
---

# Translatable text

GameShelf uses `@nuxtjs/i18n` (vue-i18n). English is the only language for
now, but no user-facing text is hard-coded, so adding one later is a matter
of translating a file.

## Where things live

- `i18n/locales/en.json`: every English message, grouped by area (`header`,
  `search`, `game`, `fields`, `signUp`, `account.security`, …). Keys are
  camelCase and say what the text is, not where it happens to appear.
- `nuxt.config.ts` → `i18n`: locales, `strategy: 'no_prefix'` (URLs never
  get `/en/`), and browser-language detection off.
- `i18n/locales.test.ts`: fails if the code uses a key that `en.json` lacks,
  or `en.json` has a key nothing uses. It reads keys from `t('…')`,
  `$t('…')`, `<i18n-t keypath="…">`, and `key: '…'` / `labelKey: '…'`
  values. Keep keys as string literals in one of those shapes so the test
  can see them. Cognito errors (`authErrors.*`) are the one exception,
  looked up by error name.

## Writing text

- Templates: `{{ $t('search.title') }}`, `:aria-label="$t('fields.showPassword')"`.
  Scripts: `const { t } = useI18n()`.
- Values go in placeholders, never string concatenation:
  `$t('game.coverAlt', { name })`. Word order differs between languages.
- Counts use plural forms: `"Show {count} more platform | Show {count} more platforms"`,
  called as `$t('game.showMorePlatforms', count)`, or
  `t(key, { term, count }, count)` when there are other values too.
- Text with a link or bold part inside a sentence uses `<i18n-t>` with a
  named slot, so translators can move the link: see the footer's
  `footer.igdbCredit`.
- Page titles: `useHead(() => ({ title: t('app.title', { page: t('…') }) }))`.
- Shared helpers return a message key, not a sentence: a `Message`
  (`{ key, params }`, in `shared/types/message.ts`), e.g. `usernameProblem`,
  `newPasswordProblem`, `passwordRules`, `authErrorKey`. The screen
  translates it.
- Dates use `Intl` with the current `locale` (see `formatReleaseDate`).
- Server error `statusMessage`s are for developers and stay English. The
  browser decides what to show from the status code.
- `plain-language` applies to every English message.

## Not translated

The brand name "GameShelf" and "IGDB", user content (usernames, game names,
summaries from IGDB), and code-level identifiers.

## Adding a language

Add `i18n/locales/<code>.json` with the same keys, add it to `locales` in
`nuxt.config.ts`, decide on URLs (`prefix_except_default` keeps English
unprefixed) and browser detection, and extend `locales.test.ts` to check
the new file has every English key.
