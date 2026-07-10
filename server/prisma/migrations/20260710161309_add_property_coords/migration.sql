-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION;

-- Backfill lat/lng for rows that predate this column (prod runs migrate
-- deploy against seeded demo data — the seed script itself does not rerun).
-- Deterministic per-row jitter, keyed on city, keeps pins from stacking
-- exactly on the city center. Cities outside this dict stay NULL and simply
-- do not appear on the map.
WITH numbered AS (
  SELECT id, city, ROW_NUMBER() OVER (PARTITION BY city ORDER BY id) - 1 AS rn
  FROM "properties"
  WHERE latitude IS NULL
),
base (city, lat, lng) AS (
  VALUES
    ('Kyiv', 50.4501, 30.5234),
    ('Lviv', 49.8397, 24.0297),
    ('Odesa', 46.4825, 30.7233),
    ('Berlin', 52.5200, 13.4050),
    ('Paris', 48.8566, 2.3522),
    ('Rome', 41.9028, 12.4964),
    ('Amsterdam', 52.3676, 4.9041)
)
UPDATE "properties" p SET
  latitude  = base.lat + ((n.rn % 7) - 3) * 0.006,
  longitude = base.lng + ((n.rn / 7 % 7) - 3) * 0.009
FROM numbered n
JOIN base ON base.city = n.city
WHERE p.id = n.id;
