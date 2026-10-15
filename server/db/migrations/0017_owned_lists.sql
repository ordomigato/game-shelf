-- Gives every existing user an Owned list (with an empty blueprint), holding
-- every game in any of their custom collections. New users get theirs when
-- their row is created.
--
-- The slug "owned" belongs to the Owned list now, so a custom collection
-- using it moves to "owned-1" (or "owned-" and part of its id, if the user
-- also has an "owned-1").
UPDATE collections AS c
SET slug = CASE
  WHEN EXISTS (
    SELECT 1 FROM collections AS other
    WHERE other.owner_id = c.owner_id AND other.slug = 'owned-1'
  ) THEN 'owned-' || left(c.id::text, 8)
  ELSE 'owned-1'
END
WHERE c.slug = 'owned' AND c.kind = 'custom';
--> statement-breakpoint
WITH missing AS (
  SELECT u.id AS owner_id, gen_random_uuid() AS blueprint_id
  FROM users u
  WHERE NOT EXISTS (
    SELECT 1 FROM collections c WHERE c.owner_id = u.id AND c.kind = 'owned'
  )
),
created_blueprints AS (
  INSERT INTO blueprints (id, owner_id, fields)
  SELECT blueprint_id, owner_id, '[]'::jsonb FROM missing
  RETURNING id, owner_id
)
INSERT INTO collections (owner_id, blueprint_id, title, slug, kind, visibility)
SELECT owner_id, id, 'Owned', 'owned', 'owned', 'private'
FROM created_blueprints;
--> statement-breakpoint
-- Each game once, in the order it was first added to a custom collection,
-- keeping that first time as when it was added.
INSERT INTO collection_items (collection_id, item_id, position, added_at)
SELECT
  owned.id,
  first_added.item_id,
  row_number() OVER (
    PARTITION BY owned.id
    ORDER BY first_added.added_at, first_added.item_id
  ),
  first_added.added_at
FROM (
  SELECT c.owner_id, ci.item_id, min(ci.added_at) AS added_at
  FROM collection_items ci
  JOIN collections c ON c.id = ci.collection_id
  WHERE c.kind = 'custom'
  GROUP BY c.owner_id, ci.item_id
) AS first_added
JOIN collections AS owned
  ON owned.owner_id = first_added.owner_id AND owned.kind = 'owned'
ON CONFLICT DO NOTHING;
