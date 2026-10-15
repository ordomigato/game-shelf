-- Starts the catalog with every IGDB game someone already has, from their
-- own rows: the name most of them use and the oldest cover. No IGDB call,
-- so fetched_at stays null and the server reads each one from IGDB later.
INSERT INTO games (igdb_id, name, cover_id)
SELECT igdb_id,
       mode() WITHIN GROUP (ORDER BY name),
       (array_agg(cover_id ORDER BY created_at) FILTER (WHERE cover_id IS NOT NULL))[1]
FROM library_items WHERE igdb_id IS NOT NULL
GROUP BY igdb_id
ON CONFLICT DO NOTHING;
