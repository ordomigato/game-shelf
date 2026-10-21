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
  CollectionLink,
  CollectionVisibility,
  FieldDefinition,
  LibraryItem,
  ListDetail,
  ListName,
  ListSummary,
} from '../../shared/types/collection'
import {
  applyListAction,
  type ListAction,
  type ListState,
} from '../../shared/utils/lists'
import { knownHiddenColumns } from '../../shared/utils/columns'
import { dataFor, visitorFields } from '../../shared/utils/field-values'
import type { ExportItem } from '../../shared/utils/csv'
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
  notFound,
  platformNames,
  toCollectionEntry,
  toLibraryItem,
} from './collections'
import { isFiltered, listOrder, listWhere, type ListQuery } from './list-query'

type ItemRow = typeof libraryItems.$inferSelect
type UserRow = typeof users.$inferSelect

/** Whether the owner has opened a list to anyone with the link. */
export function listVisibility(
  owner: Pick<UserRow, 'ownedPublic' | 'wishlistPublic'>,
  list: ListName,
): CollectionVisibility {
  return (list === 'owned' ? owner.ownedPublic : owner.wishlistPublic)
    ? 'public'
    : 'private'
}

/**
 * Lets the owner see their own list, and anyone else only a public one.
 * Anything else is a 404, like a private collection, so a private list's
 * existence isn't revealed.
 */
export function assertCanViewList(
  owner: Pick<UserRow, 'ownedPublic' | 'wishlistPublic'>,
  list: ListName,
  viewerIsOwner: boolean,
): void {
  if (!viewerIsOwner && listVisibility(owner, list) !== 'public') {
    throw notFound()
  }
}

/** Makes Owned or the Wishlist private or public. */
export async function setListVisibility(
  ownerId: string,
  list: ListName,
  visibility: CollectionVisibility,
): Promise<void> {
  await useDb()
    .update(users)
    .set(
      list === 'owned'
        ? { ownedPublic: visibility === 'public' }
        : { wishlistPublic: visibility === 'public' },
    )
    .where(eq(users.id, ownerId))
}

/**
 * The lists a viewer can open, with their sizes: both for the owner, only
 * the public ones for anyone else.
 */
export async function listSummaries(
  owner: UserRow,
  viewerIsOwner: boolean,
): Promise<ListSummary[]> {
  const counts = await listCounts(owner.id)
  return (['owned', 'wishlist'] as const)
    .filter((list) => viewerIsOwner || listVisibility(owner, list) === 'public')
    .map((list) => ({
      list,
      visibility: listVisibility(owner, list),
      itemCount: counts[list],
    }))
}

/** The rows a list holds, as a condition on `library_items`. */
const onListOf = (ownerId: string, list: ListName) =>
  and(
    eq(libraryItems.ownerId, ownerId),
    eq(list === 'owned' ? libraryItems.owned : libraryItems.wishlisted, true),
  )

/**
 * The fields a visitor may see on a list: those some game on it has a
 * value for, never a hidden one (the same rule as a public collection).
 */
export async function visitorFieldsOfList(
  ownerId: string,
  list: ListName,
  fields: FieldDefinition[],
): Promise<FieldDefinition[]> {
  const rows = await useDb()
    .selectDistinct({
      id: sql<string>`jsonb_object_keys(${libraryItems.data})`,
    })
    .from(libraryItems)
    .where(onListOf(ownerId, list))
  return visitorFields(fields, new Set(rows.map((row) => row.id)))
}

/** A row's place on the two lists. */
export function listStateOf(row: ItemRow): ListState {
  return {
    owned: row.owned,
    wishlisted: row.wishlisted,
    ownedOn: row.ownedOn,
    wantedOn: row.wantedOn,
  }
}

/**
 * The platforms some game on the list is owned or wanted on, for the filter.
 * Only ids with a `platforms` row count, the ones the cell can name.
 */
async function platformChoices(
  ownerId: string,
  list: ListName,
  viewerIsOwner: boolean,
): Promise<{ id: number; name: string }[]> {
  const db = useDb()
  // A visitor sees only the list's own platforms.
  const shown = viewerIsOwner
    ? sql`${libraryItems.ownedOn} || ${libraryItems.wantedOn}`
    : list === 'owned'
      ? sql`${libraryItems.ownedOn}`
      : sql`${libraryItems.wantedOn}`
  const onList = db
    .select({ id: sql<number>`unnest(${shown})` })
    .from(libraryItems)
    .where(onListOf(ownerId, list))
  const rows = await db
    .select({
      id: platforms.igdbId,
      name: sql<string>`coalesce(${platforms.abbreviation}, ${platforms.name})`,
    })
    .from(platforms)
    .where(inArray(platforms.igdbId, onList))
  return rows.sort((a, b) => a.name.localeCompare(b.name))
}

/** The genres some game on the list has, for the filter. */
async function genreChoices(
  ownerId: string,
  list: ListName,
): Promise<string[]> {
  const rows = await useDb()
    .selectDistinct({ name: sql<string>`unnest(${catalogGames.genres})` })
    .from(libraryItems)
    .innerJoin(catalogGames, catalogJoin)
    .where(onListOf(ownerId, list))
  return rows.map((row) => row.name).sort((a, b) => a.localeCompare(b))
}

/**
 * One page of Owned or the Wishlist: the owner's games on that list that
 * match the search and filters, in the asked order. The owner also gets
 * the custom collections each game is in and the platforms to pick from.
 * A visitor (`query.viewerIsOwner` false, on a public list) gets neither:
 * only the list's own platforms and the `fields` they may see. A page past
 * the end comes back as the last one. The sort, search and filters run in
 * SQL (see `list-query.ts`), so only this page's rows leave the database.
 * Every query is scoped to `owner`, never to anything the browser sent.
 */
export async function getListPage(
  owner: Pick<UserRow, 'id' | 'listColumns' | 'ownedPublic' | 'wishlistPublic'>,
  list: ListName,
  query: ListQuery,
  fields: FieldDefinition[],
): Promise<ListDetail> {
  const db = useDb()
  const ownerId = owner.id
  const viewerIsOwner = query.viewerIsOwner
  const where = listWhere(ownerId, list, query)
  const order = listOrder(ownerId, list, query)
  const onList = onListOf(ownerId, list)
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

  const [matching, listSize, firstTry, platformOptions, genreOptions, library] =
    await Promise.all([
      countWhere(where),
      isFiltered(query) ? countWhere(onList) : null,
      pageOf(query.page),
      platformChoices(ownerId, list, viewerIsOwner),
      genreChoices(ownerId, list),
      viewerIsOwner
        ? db
            .select({ value: count() })
            .from(libraryItems)
            .where(eq(libraryItems.ownerId, ownerId))
        : null,
    ])
  const total = matching[0]?.value ?? 0
  const itemCount = listSize ? (listSize[0]?.value ?? 0) : total
  const page = Math.min(query.page, Math.max(1, Math.ceil(total / query.size)))
  const rows = page === query.page ? firstTry : await pageOf(page)

  const [inCollections, names] = await Promise.all([
    viewerIsOwner
      ? customCollectionsOf(
          ownerId,
          rows.map(({ item }) => item.id),
        )
      : null,
    platformNames(
      rows.flatMap(({ item, game }) => [
        ...(viewerIsOwner ? (game?.platformIds ?? []) : []),
        ...item.ownedOn,
        ...item.wantedOn,
      ]),
    ),
  ])
  const items = rows.map(({ item, game }) => ({
    ...toCollectionEntry(
      item,
      game,
      item.createdAt,
      viewerIsOwner,
      names,
      viewerIsOwner ? undefined : list,
    ),
    ...(inCollections && { inCollections: inCollections.get(item.id) ?? [] }),
    data: dataFor(viewerIsOwner, fields, item.data),
  }))
  return {
    list,
    visibility: listVisibility(owner, list),
    isOwner: viewerIsOwner,
    itemCount,
    ...(library && { libraryCount: library[0]?.value ?? 0 }),
    total,
    page,
    size: query.size,
    fields,
    platforms: platformOptions,
    genres: genreOptions,
    hiddenColumns: knownHiddenColumns(
      owner.listColumns[list],
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

/**
 * Games as an export needs them: with the catalog game's release date and
 * genres, and the short names of the platforms they're owned on.
 */
export async function exportItemsOf(
  rows: (Pick<ExportItem, 'name' | 'igdbId' | 'addedAt' | 'data'> & {
    ownedOn: number[]
    wantedOn: number[]
    game: typeof catalogGames.$inferSelect | null
  })[],
): Promise<ExportItem[]> {
  const names = await platformNames(
    rows.flatMap((row) => [...row.ownedOn, ...row.wantedOn]),
  )
  return rows.map(({ game, ...row }) => ({
    ...row,
    releaseDate: game?.releaseDate ?? null,
    releasePrecision: game?.releasePrecision ?? null,
    genres: game?.genres ?? [],
    catalogPlatforms: [...row.ownedOn, ...row.wantedOn]
      .flatMap((id) => {
        const name = names.get(id)
        return name === undefined ? [] : [{ id, name }]
      })
      .sort((a, b) => a.name.localeCompare(b.name)),
  }))
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
      ownedOn: libraryItems.ownedOn,
      wantedOn: libraryItems.wantedOn,
      game: catalogGames,
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
  return exportItemsOf(
    rows.map((row) => ({ ...row, addedAt: row.addedAt.toISOString() })),
  )
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
 * values and collection links, and the answer is null. A game only moves
 * between the lists here, so it never needs room in the library.
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
