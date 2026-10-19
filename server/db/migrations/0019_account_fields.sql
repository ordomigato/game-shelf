-- Fields move from blueprints to the account. Every user gets one set of
-- fields (users.fields) shared by all their games, and collections no longer
-- have a blueprint.
--
-- Per user, the fields of all their blueprints are merged into one set.
-- Fields with the same name (ignoring case and surrounding spaces) and the
-- same kind become one field: the earliest keeps its id, select options are
-- joined, and games' values stored under the other ids move to the kept id
-- (the kept id's own value wins unless it is empty). Dashboards' charts are
-- pointed at the kept ids. A rating on a different scale, or a currency in a
-- different currency, counts as a different kind, since its values mean
-- something else. Fields that share a name but not a kind all stay, with
-- "(2)", "(3)" added to the later names. An account over its new limit keeps
-- every field. The _af_* tables are scratch space, dropped at the end.
ALTER TABLE "users" ADD COLUMN "fields" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
-- Every field of every blueprint, in order, once per field id.
CREATE TABLE "_af_fields" AS
SELECT DISTINCT ON (owner_id, old_id) *
FROM (
  SELECT
    blueprint.owner_id,
    field.value ->> 'id' AS old_id,
    field.value AS def,
    lower(btrim(field.value ->> 'name')) AS norm,
    field.value ->> 'type' AS type,
    CASE field.value ->> 'type'
      WHEN 'rating' THEN coalesce(field.value ->> 'scale', '5')
      WHEN 'currency' THEN coalesce(field.value ->> 'currency', 'USD')
      ELSE ''
    END AS variant,
    row_number() OVER (
      PARTITION BY blueprint.owner_id
      ORDER BY blueprint.created_at, blueprint.id, field.ord
    ) AS seq
  FROM "blueprints" AS blueprint
  CROSS JOIN LATERAL jsonb_array_elements(blueprint.fields)
    WITH ORDINALITY AS field(value, ord)
) AS numbered
ORDER BY owner_id, old_id, seq;--> statement-breakpoint
-- The merged fields: one per name, kind and variant. name_rank is 1 for the
-- first field with a name, 2 for the next one of another kind, and so on.
CREATE TABLE "_af_groups" AS
SELECT
  grouped.*,
  row_number() OVER (
    PARTITION BY owner_id, norm ORDER BY first_seq
  ) AS name_rank
FROM (
  SELECT
    owner_id, norm, type, variant,
    min(seq) AS first_seq,
    (array_agg(old_id ORDER BY seq))[1] AS keep_id
  FROM "_af_fields"
  GROUP BY owner_id, norm, type, variant
) AS grouped;--> statement-breakpoint
-- Old field id to the id that replaces it, for fields that were merged away.
CREATE TABLE "_af_map" AS
SELECT field.owner_id, field.old_id, grp.keep_id, field.seq
FROM "_af_fields" AS field
JOIN "_af_groups" AS grp
  ON grp.owner_id = field.owner_id
  AND grp.norm = field.norm
  AND grp.type = field.type
  AND grp.variant = field.variant
WHERE field.old_id <> grp.keep_id;--> statement-breakpoint
-- Each user's merged set.
UPDATE "users" AS u
SET "fields" = built.fields
FROM (
  SELECT
    grp.owner_id,
    jsonb_agg(
      jsonb_set(
        keep.def,
        '{name}',
        to_jsonb(
          CASE WHEN grp.name_rank = 1
            THEN btrim(keep.def ->> 'name')
            ELSE left(btrim(keep.def ->> 'name'), 50) || ' (' || grp.name_rank || ')'
          END
        )
      ) || CASE WHEN grp.type IN ('select', 'multiselect')
        THEN jsonb_build_object('options', (
          SELECT coalesce(jsonb_agg(joined.option ORDER BY joined.pos), '[]'::jsonb)
          FROM (
            SELECT option.value AS option, min(member.seq * 1000 + option.ord) AS pos
            FROM "_af_fields" AS member
            CROSS JOIN LATERAL jsonb_array_elements(coalesce(member.def -> 'options', '[]'::jsonb))
              WITH ORDINALITY AS option(value, ord)
            WHERE member.owner_id = grp.owner_id
              AND member.norm = grp.norm
              AND member.type = grp.type
              AND member.variant = grp.variant
            GROUP BY option.value
          ) AS joined
        ))
        ELSE '{}'::jsonb
      END
      ORDER BY grp.first_seq
    ) AS fields
  FROM "_af_groups" AS grp
  JOIN "_af_fields" AS keep
    ON keep.owner_id = grp.owner_id AND keep.old_id = grp.keep_id
  GROUP BY grp.owner_id
) AS built
WHERE u.id = built.owner_id;--> statement-breakpoint
-- For each game and kept field, the value to keep: the kept id's own, else
-- the first value (in field order) under an id merged into it, ignoring
-- empty values.
CREATE TABLE "_af_picked" AS
SELECT DISTINCT ON (item_id, keep_id) item_id, keep_id, value
FROM (
  SELECT item.id AS item_id, map.keep_id, 0 AS rank, item.data -> map.keep_id AS value
  FROM "library_items" AS item
  JOIN (SELECT DISTINCT owner_id, keep_id FROM "_af_map") AS map
    ON map.owner_id = item.owner_id
  WHERE item.data ? map.keep_id
  UNION ALL
  SELECT item.id, map.keep_id, map.seq, item.data -> map.old_id
  FROM "library_items" AS item
  JOIN "_af_map" AS map ON map.owner_id = item.owner_id
  WHERE item.data ? map.old_id
) AS candidates
WHERE value <> 'null'::jsonb AND value <> '""'::jsonb AND value <> '[]'::jsonb
ORDER BY item_id, keep_id, rank;--> statement-breakpoint
-- Games' values move to the kept ids.
UPDATE "library_items" AS item
SET "data" = (item.data - olds.ids) || coalesce(picked.obj, '{}'::jsonb)
FROM (
  SELECT item2.id AS item_id, array_agg(DISTINCT map.old_id) AS ids
  FROM "library_items" AS item2
  JOIN "_af_map" AS map ON map.owner_id = item2.owner_id
  WHERE item2.data ? map.old_id
  GROUP BY item2.id
) AS olds
LEFT JOIN (
  SELECT item_id, jsonb_object_agg(keep_id, value) AS obj
  FROM "_af_picked"
  GROUP BY item_id
) AS picked ON picked.item_id = olds.item_id
WHERE item.id = olds.item_id;--> statement-breakpoint
-- Charts: the field a chart measures, groups by or plots over.
UPDATE "collections" AS c
SET "dashboard" = (
  SELECT jsonb_agg(w3.v ORDER BY w.ord)
  FROM jsonb_array_elements(c.dashboard) WITH ORDINALITY AS w(value, ord)
  CROSS JOIN LATERAL (
    SELECT CASE WHEN w.value -> 'measure' ->> 'fieldId' IS NOT NULL
      THEN jsonb_set(w.value, '{measure,fieldId}', to_jsonb(coalesce(
        (SELECT map.keep_id FROM "_af_map" AS map
         WHERE map.owner_id = c.owner_id AND map.old_id = w.value -> 'measure' ->> 'fieldId'),
        w.value -> 'measure' ->> 'fieldId')))
      ELSE w.value END AS v
  ) AS w1
  CROSS JOIN LATERAL (
    SELECT CASE WHEN w1.v ->> 'groupBy' IS NOT NULL
      THEN jsonb_set(w1.v, '{groupBy}', to_jsonb(coalesce(
        (SELECT map.keep_id FROM "_af_map" AS map
         WHERE map.owner_id = c.owner_id AND map.old_id = w1.v ->> 'groupBy'),
        w1.v ->> 'groupBy')))
      ELSE w1.v END AS v
  ) AS w2
  CROSS JOIN LATERAL (
    SELECT CASE WHEN w2.v -> 'timeline' ->> 'source' IS NOT NULL
      THEN jsonb_set(w2.v, '{timeline,source}', to_jsonb(coalesce(
        (SELECT map.keep_id FROM "_af_map" AS map
         WHERE map.owner_id = c.owner_id AND map.old_id = w2.v -> 'timeline' ->> 'source'),
        w2.v -> 'timeline' ->> 'source')))
      ELSE w2.v END AS v
  ) AS w3
)
WHERE c.dashboard <> '[]'::jsonb
  AND EXISTS (SELECT 1 FROM "_af_map" AS map WHERE map.owner_id = c.owner_id);--> statement-breakpoint
-- A hand-set limit on fields per collection is now one on fields per account.
UPDATE "users"
SET "custom_limits" = ("custom_limits" - 'fieldsPerCollection')
  || jsonb_build_object('fields', "custom_limits" -> 'fieldsPerCollection')
WHERE "custom_limits" ? 'fieldsPerCollection';--> statement-breakpoint
DROP TABLE "_af_picked";--> statement-breakpoint
DROP TABLE "_af_map";--> statement-breakpoint
DROP TABLE "_af_groups";--> statement-breakpoint
DROP TABLE "_af_fields";--> statement-breakpoint
ALTER TABLE "collections" DROP CONSTRAINT "collections_blueprint_id_blueprints_id_fk";--> statement-breakpoint
ALTER TABLE "collections" DROP COLUMN "blueprint_id";--> statement-breakpoint
DROP TABLE "blueprints";
