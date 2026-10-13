/**
 * A collection's colour (its mark in the sidebar) is stored as a hex code
 * like `#7c3aed`, lowercase. Null means a colour from its name. The presets
 * offered in the dialog are in `app/utils/collection-colour.ts`.
 */
export const HEX_COLOUR = /^#[0-9a-f]{6}$/
