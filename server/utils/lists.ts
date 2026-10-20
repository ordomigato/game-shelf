import {
  and,
  count,
  desc,
  eq,
  inArray,
  isNotNull,
  sql,
  type SQL,
} from 'drizzle-orm'
import { createError } from 'h3'
import type {
  OwnerEntry,
  CollectionLink,
  FieldDefinition,
  LibraryItem,
  ListDetail,
  ListName,
} from '../../shared/types/collection'
import {
  applyListAction,
  type ListAction,
  type ListState,
} from '../../shared/utils/lists'
import { knownHiddenColumns } from '../../shared/utils/columns'
import type { ExportItem } from '../../shared/utils/csv'
import type { PlanLimits } from '../../shared/utils/plans'
import {
  games as catalogGames,
  libraryItems,
  platforms,
  users,
} from '../db/schema'
import { useDb } from './db'
import {
  catalogJoin,
  customCollectionsOf,
  getOwnedItem,
  itemName,
  toLibraryItem,
} from './collections'
import { isFiltered, listOrder, listWhere, type ListQuery } from './list-query'
import { assertListRoom, assertOwnedRoom } from './limits'

type ItemRow = typeof libraryItems.$inferSelect

/** A row's place on the two lists. */
export function listStateOf(row: ItemRow): ListState {
  return {
    owned: row.owned,
    wishlisted: row.wishlisted,
    ownedOn: row.ownedOn,
    wantedOn: row.wantedOn,
  }
}

/** The short name to show for each platform id. */
async function platformNames(ids: number[]): Promise<Map<number, string>> {
  const unique = [...new Set(ids)]
  if (!unique.length) return new Map()
  const rows = await useDb()
    .select({
      id: platforms.igdbId,
      name: sql<string>`coalesce(${platforms.abbreviation}, ${platforms.name})`,
    })
    .from(platforms)
    .where(inArray(platforms.igdbId, unique))
  return new Map(rows.map((row) => [row.id, row.name]))
}

/** The platforms some game on the list is on, for the filter. */
async function platformChoices(
  ownerId: string,
  list: ListName,
): Promise<{ id: number; name: string }[]> {
  const db = useDb()
  const column = list === 'owned' ? libraryItems.ownedOn : libraryItems.wantedOn
  const onList = db
    .select({ id: sql<number>`unnest(${column})` })
    .from(libraryItems)
    .where(
      and(
        eq(libraryItems.ownerId, ownerId),
        eq(
          list === 'owned' ? libraryItems.owned : libraryItems.wishlisted,
          true,
        ),
      ),
    )
  const rows = await db
    .select({
      id: platforms.igdbId,
      name: sql<string>`coalesce(${platforms.abbreviation}, ${platforms.name})`,
    })
    .from(platforms)
    .where(inArray(platforms.igdbId, onList))
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * One page of Owned or the Wishlist: the user's games on that list that
 * match the search and filters, in the asked order, with the custom
 * collections each is in and the platforms for that list. A page past the
 * end comes back as the last one. The sort, search and filters run in SQL
 * (see `list-query.ts`), so only this page's rows leave the database.
 */
export async function getListPage(
  ownerId: string,
  list: ListName,
  query: ListQuery,
  fields: FieldDefinition[],
  listColumns: Partial<Record<ListName, string[]>> = {},
): Promise<ListDetail> {
  const db = useDb()
  const where = listWhere(ownerId, list, query)
  const order = listOrder(ownerId, list, query)
  const onList = and(
    eq(libraryItems.ownerId, ownerId),
    eq(list === 'owned' ? libraryItems.owned : libraryItems.wishlisted, true),
  )
  const countWhere = (condition: SQL | undefined) =>
    db
      .select({ value: count() })
      .from(libraryItems)
      .leftJoin(catalogGames, catalogJoin)
      .where(condition)
  const pageOf = (page: number) =>
    db
      .select({ item: libraryItems, game: catalogGames })
      .from(libraryItems)
      .leftJoin(catalogGames, catalogJoin)
      .where(where)
      .orderBy(...order)
      .limit(query.size)
      .offset((page - 1) * query.size)

  const [matching, listSize, firstTry, platformOptions] = await Promise.all([
    countWhere(where),
    isFiltered(query) ? countWhere(onList) : null,
    pageOf(query.page),
    platformChoices(ownerId, list),
  ])
  const total = matching[0]?.value ?? 0
  const itemCount = listSize ? (listSize[0]?.value ?? 0) : total
  const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.size)))
  const rows = page === query.page ? firstTry : await pageOf(page)

  const platformIdsOf = (item: ItemRow) =>
    list === 'owned' ? item.ownedOn : item.wantedOn
  const [inCollections, names] = await Promise.all([
    customCollectionsOf(
      ownerId,
      rows.map(({ item }) => item.id),
    ),
    platformNames(rows.flatMap(({ item }) => platformIdsOf(item))),
  ])
  const items: OwnerEntry[] = rows.map(({ item, game }) => ({
    ...toLibraryItem(item, game),
    addedAt: item.createdAt.toISOString(),
    wanted: item.wishlisted,
    inCollections: inCollections.get(item.id) ?? [],
    platforms: platformIdsOf(item).flatMap((id) => names.get(id) ?? []),
  }))
  return {
    list,
    itemCount,
    total,
    page,
    size: query.size,
    fields,
    platforms: platformOptions,
    hiddenColumns: knownHiddenColumns(
      listColumns[list],
      'list',
      fields.map((field) => field.id),
    ),
    items,
  }
}

/** Saves the columns the owner hides on a list, keeping the other list's. */
export async function setListColumns(
  owner: { id: string; listColumns: Partial<Record<ListName, string[]>> },
  list: ListName,
  hidden: string[],
): Promise<string[]> {
  await useDb()
    .update(users)
    .set({ listColumns: { ...owner.listColumns, [list]: hidden } })
    .where(eq(users.id, owner.id))
  return hidden
}

/** Every game on a list, newest first, with what an export needs. */
export async function listForExport(
  ownerId: string,
  list: ListName,
): Promise<ExportItem[]> {
  const rows = await useDb()
    .select({
      igdbId: libraryItems.igdbId,
      name: itemName,
      addedAt: libraryItems.createdAt,
      data: libraryItems.data,
    })
    .from(libraryItems)
    .leftJoin(catalogGames, catalogJoin)
    .where(
      and(
        eq(libraryItems.ownerId, ownerId),
        eq(
          list === 'owned' ? libraryItems.owned : libraryItems.wishlisted,
          true,
        ),
      ),
    )
    .orderBy(desc(libraryItems.createdAt), desc(libraryItems.id))
  return rows.map((row) => ({ ...row, addedAt: row.addedAt.toISOString() }))
}

/** How many games are on each list, for the sidebar. */
export async function listCounts(
  ownerId: string,
): Promise<Record<ListName, number>> {
  const [row] = await useDb()
    .select({
      owned: sql<number>`count(*) filter (where ${libraryItems.owned})::int`,
      wishlist: sql<number>`count(*) filter (where ${libraryItems.wishlisted})::int`,
    })
    .from(libraryItems)
    .where(eq(libraryItems.ownerId, ownerId))
  return { owned: row?.owned ?? 0, wishlist: row?.wishlist ?? 0 }
}

/** The custom collections a game is in, for the question before removing it. */
export async function collectionsOfItem(
  ownerId: string,
  itemId: string,
): Promise<CollectionLink[]> {
  await getOwnedItem(ownerId, itemId)
  const byItem = await customCollectionsOf(ownerId, [itemId])
  return byItem.get(itemId) ?? []
}

/** 400 unless the game is on every one of these platforms in the catalog. */
async function assertPlatformsOf(
  row: ItemRow,
  platformIds: number[],
): Promise<void> {
  if (!platformIds.length) return
  const [game] =
    row.igdbId === null
      ? []
      : await useDb()
          .select({ platformIds: catalogGames.platformIds })
          .from(catalogGames)
          .where(eq(catalogGames.igdbId, row.igdbId))
  if (!platformIds.every((id) => game?.platformIds.includes(id))) {
    throw createError({ statusCode: 400, statusMessage: 'Unknown platform' })
  }
}

/** An integer[] value in SQL, for comparing with an array column. */
const intArray = (ids: number[]) =>
  ids.length
    ? sql`ARRAY[${sql.join(
        ids.map((id) => sql`${id}`),
        sql`, `,
      )}]::integer[]`
    : sql`'{}'::integer[]`

/** Rows still in the state that was read, so a stale change matches none. */
const stillIn = (id: string, ownerId: string, read: ListState) =>
  and(
    eq(libraryItems.id, id),
    eq(libraryItems.ownerId, ownerId),
    eq(libraryItems.owned, read.owned),
    eq(libraryItems.wishlisted, read.wishlisted),
    sql`${libraryItems.ownedOn} = ${intArray(read.ownedOn)}`,
    sql`${libraryItems.wantedOn} = ${intArray(read.wantedOn)}`,
  )

/**
 * Changes a game's place on the lists, one action after another, and
 * saves the result once. A game left on neither list is deleted with its
 * values and collection links, and the answer is null. Room is checked when
 * the game becomes owned, or joins the Wishlist.
 *
 * The write only happens if the game is still in the state it was read in,
 * so a change made from a stale page can't undo another one (or delete a
 * game that has since moved to the other list). On a mismatch it reads
 * again and retries once, then answers 409.
 */
export async function changeItemLists(
  ownerId: string,
  itemId: string,
  actions: ListAction[],
  limits: PlanLimits,
): Promise<LibraryItem | null> {
  const db = useDb()
  for (let attempt = 0; attempt < 2; attempt++) {
    const row = await getOwnedItem(ownerId, itemId)
    const before = listStateOf(row)
    let state: ListState | null = before
    for (const action of actions) {
      if (!state) break
      if (action.type === 'setOwnedOn' || action.type === 'setWantedOn') {
        await assertPlatformsOf(row, action.platforms)
      }
      state = applyListAction(state, action)
    }
    if (!state) {
      const deleted = await db
        .delete(libraryItems)
        .where(stillIn(row.id, ownerId, before))
        .returning({ id: libraryItems.id })
      if (deleted.length) return null
      continue
    }
    if (state.owned && !before.owned) {
      await assertOwnedRoom(ownerId, 1, limits)
    }
    if (state.wishlisted && !before.wishlisted) {
      await assertListRoom(ownerId, 'wishlist', 1, limits)
    }
    const [updated] = await db
      .update(libraryItems)
      .set(state)
      .where(stillIn(row.id, ownerId, before))
      .returning()
    if (!updated) continue
    const [game] = row.igdbId
      ? await db
          .select()
          .from(catalogGames)
          .where(
            and(
              eq(catalogGames.igdbId, row.igdbId),
              isNotNull(catalogGames.fetchedAt),
            ),
          )
      : []
    return toLibraryItem(updated, game ?? null)
  }
  throw createError({ statusCode: 409, statusMessage: 'Game changed' })
}
