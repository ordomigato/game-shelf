import { sql } from 'drizzle-orm'
import type {
  ExploreCollection,
  ExplorePage,
} from '../../shared/types/collection'

export const EXPLORE_PAGE_SIZE = 24

interface ExploreRow extends Record<string, unknown> {
  id: string
  title: string
  slug: string
  kind: ExploreCollection['kind']
  description: string | null
  item_count: number
  active_at: string | Date
  username: string
  display_name: string | null
  preview: { name: string; coverId: string | null }[] | null
}

/**
 * Everyone's public collections that have games, most recently active
 * first: changed, or with a game added. Names in the subqueries are
 * spelled out on purpose (see the postgres-change skill).
 */
export async function listExplore(page: number): Promise<ExplorePage> {
  const offset = (page - 1) * EXPLORE_PAGE_SIZE
  const result = await useDb().execute<ExploreRow>(sql`
    select
      c.id, c.title, c.slug, c.kind, c.description,
      stats.item_count,
      greatest(c.updated_at, stats.last_added) as active_at,
      u.username, u.display_name,
      (
        select json_agg(json_build_object('name', first.name, 'coverId', first.cover_id))
        from (
          select li.name, li.cover_id
          from collection_items as ci
          join library_items as li on li.id = ci.item_id
          where ci.collection_id = c.id
          order by ci.position, ci.added_at
          limit 4
        ) as first
      ) as preview
    from collections as c
    join users as u on u.id = c.owner_id
    join lateral (
      select count(*)::int as item_count, max(entry.added_at) as last_added
      from collection_items as entry
      where entry.collection_id = c.id
    ) as stats on true
    where c.visibility = 'public'
      and u.username is not null
      and stats.item_count > 0
    order by active_at desc, c.id
    limit ${EXPLORE_PAGE_SIZE + 1}
    offset ${offset}
  `)
  const rows = result.rows
  return {
    collections: rows.slice(0, EXPLORE_PAGE_SIZE).map((row) => ({
      id: row.id,
      title: row.title,
      slug: row.slug,
      kind: row.kind,
      description: row.description,
      itemCount: row.item_count,
      activeAt: new Date(row.active_at).toISOString(),
      owner: { username: row.username, displayName: row.display_name },
      preview: row.preview ?? [],
    })),
    hasMore: rows.length > EXPLORE_PAGE_SIZE,
  }
}
