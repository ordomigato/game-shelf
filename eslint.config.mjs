// @ts-check
import prettier from 'eslint-config-prettier/flat'
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    // Copied verbatim from the shadcn-vue registry. Linting them against
    // local rules would conflict with every future `shadcn-vue add`.
    ignores: ['app/components/ui/**', 'app/lib/utils.ts'],
  },
  {
    // SST loads its global types ($config, sst, aws) through this reference.
    files: ['sst.config.ts'],
    rules: {
      '@typescript-eslint/triple-slash-reference': 'off',
    },
  },
  prettier,
)
