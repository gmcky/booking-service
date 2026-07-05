-- Add nullable location columns first; country is backfilled below then
-- locked to NOT NULL once every existing row has a value.
ALTER TABLE "properties" ADD COLUMN "country" TEXT, ADD COLUMN "district" TEXT;

-- Backfill district for the 20 seed rows (matched by title).
UPDATE "properties" SET "district" = 'Podil' WHERE "title" = 'Modern Studio in Podil';
UPDATE "properties" SET "district" = 'Shevchenkivskyi' WHERE "title" = 'Spacious 2BR Apartment near Khreshchatyk';
UPDATE "properties" SET "district" = 'Pechersk' WHERE "title" = 'Cosy Room in Historic Pechersk';
UPDATE "properties" SET "district" = 'Podil' WHERE "title" = 'Designer Loft on Vozdvizhenka';
UPDATE "properties" SET "district" = 'Obolon' WHERE "title" = 'Private House with Garden, Obolon';

UPDATE "properties" SET "district" = 'Old Town' WHERE "title" = 'Old Town Apartment in Lviv Centre';
UPDATE "properties" SET "district" = 'Lychakiv' WHERE "title" = 'Cosy Cottage near Lychakiv Cemetery';
UPDATE "properties" SET "district" = 'Old Town' WHERE "title" = 'Modern Apartment near Rynok Square';

UPDATE "properties" SET "district" = 'Arcadia' WHERE "title" = 'Sea View Apartment in Arcadia';
UPDATE "properties" SET "district" = 'City Centre' WHERE "title" = 'Heritage Apartment on Derybasivska';
UPDATE "properties" SET "district" = 'Fontanka' WHERE "title" = 'Beach House with Private Pool';

UPDATE "properties" SET "district" = 'Mitte' WHERE "title" = 'Minimalist Studio in Mitte';
UPDATE "properties" SET "district" = 'Kreuzberg' WHERE "title" = 'Kreuzberg Loft with Courtyard';
UPDATE "properties" SET "district" = 'Prenzlauer Berg' WHERE "title" = 'Classic Berlin Altbau near Prenzlauer Berg';

UPDATE "properties" SET "district" = '7th arrondissement' WHERE "title" = 'Charming Studio near the Eiffel Tower';
UPDATE "properties" SET "district" = 'Le Marais' WHERE "title" = 'Haussmann Apartment in Le Marais';

UPDATE "properties" SET "district" = 'Trastevere' WHERE "title" = 'Trastevere Apartment with Rooftop';
UPDATE "properties" SET "district" = 'Centro Storico' WHERE "title" = 'Historic Flat near the Colosseum';

UPDATE "properties" SET "district" = 'Jordaan' WHERE "title" = 'Canal House Apartment, Jordaan';
UPDATE "properties" SET "district" = 'Noord' WHERE "title" = 'Modern Houseboat on the IJ';

-- Backfill country by city.
UPDATE "properties" SET "country" = 'Ukraine' WHERE "city" = 'Kyiv';
UPDATE "properties" SET "country" = 'Ukraine' WHERE "city" = 'Lviv';
UPDATE "properties" SET "country" = 'Ukraine' WHERE "city" = 'Odesa';
UPDATE "properties" SET "country" = 'Germany' WHERE "city" = 'Berlin';
UPDATE "properties" SET "country" = 'France' WHERE "city" = 'Paris';
UPDATE "properties" SET "country" = 'Italy' WHERE "city" = 'Rome';
UPDATE "properties" SET "country" = 'Netherlands' WHERE "city" = 'Amsterdam';

-- Any non-seed rows left without a country fall back to Ukraine.
UPDATE "properties" SET "country" = 'Ukraine' WHERE "country" IS NULL;

ALTER TABLE "properties" ALTER COLUMN "country" SET NOT NULL;
