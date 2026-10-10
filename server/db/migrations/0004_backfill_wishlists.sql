-- Gives every existing user a Wishlist (with an empty blueprint). New users
-- get theirs when their row is created.
WITH missing AS (
  SELECT u.id AS owner_id, gen_random_uuid() AS blueprint_id
  FROM users u
  WHERE NOT EXISTS (
    SELECT 1 FROM collections c WHERE c.owner_id = u.id AND c.kind = 'wishlist'
  )
),
created_blueprints AS (
  INSERT INTO blueprints (id, owner_id, fields)
  SELECT blueprint_id, owner_id, '[]'::jsonb FROM missing
  RETURNING id, owner_id
)
INSERT INTO collections (owner_id, blueprint_id, title, slug, kind)
SELECT owner_id, id, 'Wishlist', 'wishlist', 'wishlist' FROM created_blueprints;
--> statement-breakpoint
-- Wishlists created before this change started with three columns. Nothing
-- could set values in them yet, so they start empty like new ones.
UPDATE blueprints SET fields = '[]'::jsonb
WHERE id IN (SELECT blueprint_id FROM collections WHERE kind = 'wishlist');
