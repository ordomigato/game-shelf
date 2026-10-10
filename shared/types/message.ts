/**
 * A user-facing message as an i18n key plus its values, translated where
 * it's shown (`t(message.key, message.params)`).
 */
export interface Message {
  key: string
  params?: Record<string, string | number>
}
