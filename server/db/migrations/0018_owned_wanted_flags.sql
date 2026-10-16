-- Owned and the Wishlist stop being collections. They become two flags on a
-- game (library_items.owned and wishlisted), with the platforms (versions)
-- each is for, and the database rules out a game that is both owned and
-- wishlisted unless it is wanted on platforms the owned copy isn't on.
--
-- Order matters: the flags are added first, filled from the old lists, then
-- the old lists (collections of kind owned and wishlist) are removed along
-- with the kind column, and the checks come last.
ALTER TABLE "library_items" ADD COLUMN "owned" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "library_items" ADD COLUMN "wishlisted" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "library_items" ADD COLUMN "owned_on" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
ALTER TABLE "library_items" ADD COLUMN "wanted_on" integer[] DEFAULT '{}' NOT NULL;--> statement-breakpoint
-- Games in no collection at all (left behind when a game came off the
-- Wishlist) were out of sight, so they go instead of turning up as owned.
DELETE FROM "library_items" AS item
WHERE NOT EXISTS (
  SELECT 1 FROM "collection_items" AS entry WHERE entry.item_id = item.id
);--> statement-breakpoint
-- A game whose only list was the Wishlist is wishlisted. Every other game
-- stays owned (the column's default), including a game on both lists.
UPDATE "library_items" AS item
SET "owned" = false, "wishlisted" = true
WHERE EXISTS (
    SELECT 1 FROM "collection_items" AS entry
    JOIN "collections" AS list ON list.id = entry.collection_id
    WHERE entry.item_id = item.id AND list.kind = 'wishlist'
  )
  AND NOT EXISTS (
    SELECT 1 FROM "collection_items" AS entry
    JOIN "collections" AS list ON list.id = entry.collection_id
    WHERE entry.item_id = item.id AND list.kind IN ('owned', 'custom')
  );--> statement-breakpoint
-- Values in fields that only Owned or the Wishlist had are dropped. A
-- blueprint that a custom collection also uses keeps its values.
UPDATE "library_items" AS item
SET "data" = item.data - gone.ids
FROM (
  SELECT list.owner_id, array_agg(DISTINCT field.value ->> 'id') AS ids
  FROM "collections" AS list
  JOIN "blueprints" AS blueprint ON blueprint.id = list.blueprint_id
  CROSS JOIN LATERAL jsonb_array_elements(blueprint.fields) AS field(value)
  WHERE list.kind IN ('owned', 'wishlist')
    AND NOT EXISTS (
      SELECT 1 FROM "collections" AS other
      WHERE other.blueprint_id = blueprint.id AND other.kind = 'custom'
    )
  GROUP BY list.owner_id
) AS gone
WHERE item.owner_id = gone.owner_id AND item.data ?| gone.ids;--> statement-breakpoint
-- Removing the two lists removes their games' links, their pins and their
-- dashboards with them (all cascade). The games themselves stay.
DELETE FROM "collections" WHERE "kind" IN ('owned', 'wishlist');--> statement-breakpoint
-- Their private blueprints are left with nothing using them.
DELETE FROM "blueprints" AS blueprint
WHERE blueprint.shared = false AND NOT EXISTS (
  SELECT 1 FROM "collections" AS used WHERE used.blueprint_id = blueprint.id
);--> statement-breakpoint
ALTER TABLE "collections" DROP CONSTRAINT "collections_kind";--> statement-breakpoint
DROP INDEX "collections_one_wishlist_idx";--> statement-breakpoint
DROP INDEX "collections_one_owned_idx";--> statement-breakpoint
ALTER TABLE "collections" DROP COLUMN "kind";--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_platforms_apart" CHECK (not ("library_items"."owned_on" && "library_items"."wanted_on"));--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_owned_on" CHECK (cardinality("library_items"."owned_on") = 0 or "library_items"."owned");--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_wanted_on" CHECK (cardinality("library_items"."wanted_on") = 0 or "library_items"."wishlisted");--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_both_versions" CHECK (not ("library_items"."owned" and "library_items"."wishlisted") or cardinality("library_items"."wanted_on") > 0);--> statement-breakpoint
ALTER TABLE "library_items" ADD CONSTRAINT "library_items_on_a_list" CHECK ("library_items"."owned" or "library_items"."wishlisted");
