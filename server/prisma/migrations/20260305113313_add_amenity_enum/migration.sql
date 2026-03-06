/*
  Warnings:

  - The `amenities` column on the `properties` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "Amenity" AS ENUM ('WIFI', 'AIR_CONDITIONING', 'HEATING', 'KITCHEN', 'WASHER', 'DRYER', 'DISHWASHER', 'PARKING', 'POOL', 'GYM', 'BALCONY', 'TERRACE', 'ROOFTOP_TERRACE', 'GARDEN', 'BBQ', 'FIREPLACE', 'BATHTUB', 'PRIVATE_BATHROOM', 'TV', 'SMART_TV', 'COFFEE_MACHINE', 'PROJECTOR', 'STANDING_DESK', 'ELEVATOR', 'PET_FRIENDLY', 'WHEELCHAIR_ACCESSIBLE', 'SEA_VIEW', 'CITY_CENTRE', 'BEACHFRONT', 'KIDS_PLAY_AREA', 'BIKE_INCLUDED', 'BIKE_RENTAL_NEARBY', 'COURTYARD', 'CANAL_VIEW', 'RIVER_VIEW', 'SUN_DECK', 'KAYAK', 'HISTORIC_BUILDING', 'VINYL_RECORD_PLAYER', 'BOOKS');

-- AlterTable
ALTER TABLE "properties" DROP COLUMN "amenities",
ADD COLUMN     "amenities" "Amenity"[];
