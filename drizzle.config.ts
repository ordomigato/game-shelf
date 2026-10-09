import { defineConfig } from 'drizzle-kit'
import { Resource } from 'sst'

function databaseUrl() {
  try {
    return Resource.DatabaseUrl.value
  } catch {
    return undefined
  }
}

const url = databaseUrl()

// `generate` works offline. Commands that touch the database (`migrate`,
// `studio`) need the URL, which `sst shell` provides.
export default defineConfig({
  dialect: 'postgresql',
  schema: './server/db/schema.ts',
  out: './server/db/migrations',
  ...(url ? { dbCredentials: { url } } : {}),
})
