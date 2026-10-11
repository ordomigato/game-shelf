import { z } from 'zod'
import {
  MATCH_BATCH_SIZE,
  pickMatch,
  type NameMatch,
} from '../../../shared/utils/game-match'
import type { IgdbGame } from '../../utils/igdb-queries'

const bodySchema = z.object({
  names: z
    .array(z.string().trim().min(1).max(200))
    .min(1)
    .max(MATCH_BATCH_SIZE),
})

/** IGDB allows 4 requests a second, so three searches run at a time. */
const AT_ONCE = 3

/** One name's IGDB search, retried once after a pause if IGDB is busy. */
async function search(name: string): Promise<IgdbGame[]> {
  try {
    return await igdbRequest<IgdbGame[]>('games', buildMatchQuery(name))
  } catch (error) {
    if ((error as { statusCode?: number }).statusCode !== 503) throw error
    await new Promise((resolve) => setTimeout(resolve, 1000))
    return igdbRequest<IgdbGame[]>('games', buildMatchQuery(name))
  }
}

/**
 * Matches game names from an imported file to IGDB, up to 10 per request.
 * Each comes back with a suggestion, how sure it is, and the candidates to
 * choose from instead.
 */
export default defineEventHandler(async (event): Promise<NameMatch[]> => {
  const { sub } = await requireAuth(event)
  const user = await findOrCreateUser(sub)
  // 1,000 names in ten minutes: a big import's worth.
  await rateLimit(event, `match:${user.id}`, { limit: 100, windowSeconds: 600 })
  const { names } = await readValidatedBody(event, bodySchema.parse)
  const results: NameMatch[] = []
  for (let start = 0; start < names.length; start += AT_ONCE) {
    const batch = names.slice(start, start + AT_ONCE)
    const found = await Promise.all(batch.map(search))
    batch.forEach((name, index) => {
      results.push(
        pickMatch(
          name,
          rankSearchResults(found[index] ?? [])
            .slice(0, 5)
            .map(toGameSummary),
        ),
      )
    })
  }
  return results
})
