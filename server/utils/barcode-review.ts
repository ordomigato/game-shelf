import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm'
import { alias } from 'drizzle-orm/pg-core'
import { createError, type H3Event } from 'h3'
import type {
  BarcodeReviewAction,
  BarcodeReviewGroup,
  BarcodeReviewOutcome,
  BarcodeReviewStatus,
  BarcodeReviewTarget,
} from '../../shared/types/barcode'
import { barcodeCacheFresh, reviewGroupKey } from '../../shared/utils/barcode'
import { barcodeLookups, games, platforms, users } from '../db/schema'
import { log } from './log'
import { submitToScanDex } from './scandex'

/** The most groups one action request carries. */
export const MAX_REVIEWS = 20

/**
 * The most pick rows one listing reads. Only a safety cap: picks waiting
 * for review are expected to number in the low hundreds at most.
 */
export const MAX_LISTED = 1000

/**
 * The signed-in user, only if they review barcodes (`users.reviews_barcodes`,
 * set by hand). Anyone else gets a 404 before any work, so the feature
 * doesn't show itself to them.
 */
export async function requireReviewer(event: H3Event) {
  const { sub } = await requireAuth(event)
  const user = await findOrCreateUser(sub)
  if (!user.reviewsBarcodes) {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }
  return user
}

const groupKey = reviewGroupKey

/** The pick rows of one group. */
const inGroup = (target: BarcodeReviewTarget) =>
  and(
    eq(barcodeLookups.source, 'user'),
    eq(barcodeLookups.code, target.code),
    eq(barcodeLookups.igdbId, target.igdbId),
    target.platformId === null
      ? isNull(barcodeLookups.platformId)
      : eq(barcodeLookups.platformId, target.platformId),
  )

/**
 * The picks with this status, grouped by barcode, game and platform. Each
 * group says how many people picked it, who, what ScanDex says about the
 * barcode now, and (for pending ones) whether another game is already
 * approved for it. Pending groups come with the most agreed ones first,
 * the others with the latest first. Usernames are for the reviewer alone.
 */
export async function listReviewGroups(
  status: BarcodeReviewStatus,
): Promise<BarcodeReviewGroup[]> {
  const db = useDb()
  const rows = await db
    .select({
      code: barcodeLookups.code,
      igdbId: barcodeLookups.igdbId,
      platformId: barcodeLookups.platformId,
      sentAt: barcodeLookups.sentAt,
      updatedAt: barcodeLookups.updatedAt,
      username: users.username,
      name: games.name,
      coverId: games.coverId,
      platform: platforms.name,
    })
    .from(barcodeLookups)
    .innerJoin(games, eq(games.igdbId, barcodeLookups.igdbId))
    .leftJoin(platforms, eq(platforms.igdbId, barcodeLookups.platformId))
    .leftJoin(users, eq(users.id, barcodeLookups.submittedBy))
    .where(
      and(eq(barcodeLookups.source, 'user'), eq(barcodeLookups.status, status)),
    )
    .orderBy(desc(barcodeLookups.updatedAt))
    .limit(MAX_LISTED)
  if (!rows.length) return []

  const byKey = new Map<string, BarcodeReviewGroup>()
  for (const row of rows) {
    const key = groupKey({
      code: row.code,
      igdbId: row.igdbId!,
      platformId: row.platformId,
    })
    const group = byKey.get(key)
    if (group) {
      group.people += 1
      if (row.username) group.users.push(row.username)
      if (row.sentAt) group.sent = true
      continue
    }
    byKey.set(key, {
      key,
      code: row.code,
      igdbId: row.igdbId!,
      platformId: row.platformId,
      name: row.name,
      coverId: row.coverId,
      platform: row.platform,
      status,
      people: 1,
      users: row.username ? [row.username] : [],
      // Newest first, so the first row of a group is its latest pick.
      pickedAt: row.updatedAt.toISOString(),
      sent: row.sentAt !== null,
      scandex: null,
      disagrees: false,
      conflict: null,
    })
  }
  const found = [...byKey.values()]
  for (const group of found) group.users.reverse()

  const codes = [...new Set(found.map((group) => group.code))]
  const approved = alias(barcodeLookups, 'approved')
  const [scandexRows, approvedRows] = await Promise.all([
    db
      .select({
        code: barcodeLookups.code,
        igdbId: barcodeLookups.igdbId,
        fetchedAt: barcodeLookups.fetchedAt,
        name: games.name,
      })
      .from(barcodeLookups)
      .leftJoin(games, eq(games.igdbId, barcodeLookups.igdbId))
      .where(
        and(
          eq(barcodeLookups.source, 'scandex'),
          inArray(barcodeLookups.code, codes),
        ),
      ),
    status === 'pending'
      ? db
          .select({
            code: approved.code,
            igdbId: approved.igdbId,
            platformId: approved.platformId,
            name: games.name,
          })
          .from(approved)
          .leftJoin(games, eq(games.igdbId, approved.igdbId))
          .where(
            and(
              eq(approved.source, 'user'),
              eq(approved.status, 'approved'),
              inArray(approved.code, codes),
            ),
          )
      : Promise.resolve([]),
  ])
  const scandexByCode = new Map(scandexRows.map((row) => [row.code, row]))
  const approvedByCode = new Map(approvedRows.map((row) => [row.code, row]))
  const now = new Date()
  for (const group of found) {
    const answer = scandexByCode.get(group.code)
    // A day-old "no match" is stale, so it isn't shown as ScanDex's answer.
    if (
      answer &&
      barcodeCacheFresh(
        { igdbId: answer.igdbId, fetchedAt: answer.fetchedAt ?? new Date(0) },
        now,
      )
    ) {
      group.scandex =
        answer.igdbId === null
          ? 'none'
          : { igdbId: answer.igdbId, name: answer.name }
      group.disagrees = answer.igdbId !== null && answer.igdbId !== group.igdbId
    }
    const other = approvedByCode.get(group.code)
    if (
      other &&
      (other.igdbId !== group.igdbId || other.platformId !== group.platformId)
    ) {
      group.conflict = { name: other.name ?? '' }
    }
  }

  return found.sort(
    (a, b) =>
      (status === 'pending' ? b.people - a.people : 0) ||
      b.pickedAt.localeCompare(a.pickedAt),
  )
}

/**
 * Approves a pending group: all its rows in one statement, and only if no
 * other game is approved for the barcode. `conflict` when there is one,
 * `gone` when the group has nothing pending any more.
 */
async function approve(
  target: BarcodeReviewTarget,
): Promise<BarcodeReviewOutcome['result']> {
  const db = useDb()
  const done = await db
    .update(barcodeLookups)
    .set({ status: 'approved', reviewedAt: new Date() })
    .where(
      and(
        inGroup(target),
        eq(barcodeLookups.status, 'pending'),
        // No other game or platform is approved for the barcode.
        sql`not exists (
          select 1 from ${barcodeLookups} as other
          where other.source = 'user'
            and other.status = 'approved'
            and other.code = ${barcodeLookups.code}
            and (other.igdb_id, other.platform_id)
              is distinct from (${barcodeLookups.igdbId}, ${barcodeLookups.platformId}))`,
      ),
    )
    .returning({ id: barcodeLookups.id })
  if (done.length) return 'done'
  const [pending] = await db
    .select({ id: barcodeLookups.id })
    .from(barcodeLookups)
    .where(and(inGroup(target), eq(barcodeLookups.status, 'pending')))
    .limit(1)
  return pending ? 'conflict' : 'gone'
}

/**
 * Rejects a group that is pending, or approved and not yet sent. A sent
 * group can't be taken back, so it is `gone` like one with nothing to reject.
 */
async function reject(
  target: BarcodeReviewTarget,
): Promise<BarcodeReviewOutcome['result']> {
  const done = await useDb()
    .update(barcodeLookups)
    .set({ status: 'rejected', reviewedAt: new Date() })
    .where(
      and(
        inGroup(target),
        or(
          eq(barcodeLookups.status, 'pending'),
          and(
            eq(barcodeLookups.status, 'approved'),
            isNull(barcodeLookups.sentAt),
          ),
        ),
      ),
    )
    .returning({ id: barcodeLookups.id })
  return done.length ? 'done' : 'gone'
}

type SendResult = NonNullable<BarcodeReviewOutcome['send']>

const failed = (status = 0, message: string | null = null): SendResult => ({
  result: 'failed',
  status,
  message,
})

function logFailure(error: unknown) {
  // Never the database's error, which carries the barcodes.
  log('warn', 'barcode.review_failed', {
    status: -1,
    error: error instanceof Error ? error.name : 'unknown',
  })
}

/**
 * Sends an approved group to ScanDex, once. Only the barcode and the IGDB
 * game and platform go, with their names from our catalog, never anything
 * about the people. `sent_at` is claimed in one statement before sending, so
 * two requests never send the same group, and given back when the send
 * fails so the group can be sent again. Never throws: a failure is logged
 * and shows as failed.
 */
async function send(target: BarcodeReviewTarget): Promise<SendResult> {
  const claimed: number[] = []
  let sent = false
  try {
    if (target.platformId === null) return failed()
    const db = useDb()
    const [names] = await db
      .select({ name: games.name, platform: platforms.name })
      .from(games)
      .innerJoin(platforms, eq(platforms.igdbId, target.platformId))
      .where(eq(games.igdbId, target.igdbId))
    if (!names) return failed()
    const won = await db
      .update(barcodeLookups)
      .set({ sentAt: new Date() })
      .where(
        and(
          inGroup(target),
          eq(barcodeLookups.status, 'approved'),
          isNull(barcodeLookups.sentAt),
        ),
      )
      .returning({ id: barcodeLookups.id })
    claimed.push(...won.map((row) => row.id))
    if (!claimed.length) return failed()
    const outcome = await submitToScanDex({
      igdbId: target.igdbId,
      platformId: target.platformId,
      platform: names.platform,
      name: names.name,
      code: target.code,
    })
    if (outcome.ok) {
      sent = true
      return { result: 'sent' }
    }
    return failed(outcome.status, outcome.message)
  } catch (error) {
    logFailure(error)
    return failed()
  } finally {
    if (claimed.length && !sent) {
      try {
        await useDb()
          .update(barcodeLookups)
          .set({ sentAt: null })
          .where(inArray(barcodeLookups.id, claimed))
      } catch (error) {
        logFailure(error)
      }
    }
  }
}

/**
 * Does one action on up to 20 groups and says how each went.
 * - `approve` and `reject` change the status of the group's picks.
 * - `send` sends approved groups that weren't sent.
 * - `approveAndSend` approves, then sends what was approved. If the send
 *   fails the group stays approved, and can be sent again.
 * Groups are approved one after another, so two of the same barcode can't
 * both win. Sends run together, each with its own timeout, and all finish
 * before this returns, so no claim is left behind.
 */
export async function reviewGroups(
  action: BarcodeReviewAction,
  targets: BarcodeReviewTarget[],
): Promise<BarcodeReviewOutcome[]> {
  const unique = new Map(targets.map((target) => [groupKey(target), target]))
  const wanted = [...unique.values()].slice(0, MAX_REVIEWS)
  const outcomes = new Map<string, BarcodeReviewOutcome>()
  for (const target of wanted) {
    let result: BarcodeReviewOutcome['result'] = 'done'
    try {
      if (action === 'approve' || action === 'approveAndSend') {
        result = await approve(target)
      } else if (action === 'reject') {
        result = await reject(target)
      }
    } catch (error) {
      logFailure(error)
      result = 'gone'
    }
    outcomes.set(groupKey(target), { ...target, result })
  }
  if (action === 'send' || action === 'approveAndSend') {
    await Promise.all(
      wanted
        .filter((target) => outcomes.get(groupKey(target))!.result === 'done')
        .map(async (target) => {
          outcomes.get(groupKey(target))!.send = await send(target)
        }),
    )
  }
  return wanted.map((target) => outcomes.get(groupKey(target))!)
}
