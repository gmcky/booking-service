-- House-rule booleans. Defaults: pets not allowed, infants allowed —
-- matching the common real-world defaults.
ALTER TABLE "properties"
  ADD COLUMN "petsAllowed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "infantsAllowed" BOOLEAN NOT NULL DEFAULT true;

-- Any row that already advertises PET_FRIENDLY as an amenity allows pets.
UPDATE "properties" SET "petsAllowed" = true WHERE 'PET_FRIENDLY' = ANY("amenities");

-- Seed backfill: pet-friendly houses with outdoor space.
UPDATE "properties" SET "petsAllowed" = true WHERE "title" IN (
  'Private House with Garden, Obolon',
  'Cosy Cottage near Lychakiv Cemetery',
  'Beach House with Private Pool',
  'Kreuzberg Loft with Courtyard'
);

-- Seed backfill: places that do not suit infants.
UPDATE "properties" SET "infantsAllowed" = false WHERE "title" IN (
  'Cosy Room in Historic Pechersk',
  'Designer Loft on Vozdvizhenka',
  'Minimalist Studio in Mitte'
);
