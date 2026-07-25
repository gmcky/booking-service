import type { LocationCountry } from "@/lib/api/properties";
import type { DetectedLocation } from "@/lib/geo/detect-location";

/** Half-height of the "around you" box, in km. Roughly a region, not a city. */
const NEARBY_RADIUS_KM = 100;
const KM_PER_LAT_DEGREE = 111;

export interface NearbyCity {
  country: string;
  city: string;
}

export interface NearbyBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * Match a detected city against the cities that actually have listings. The
 * ISO country label may not match host-entered free text, so a same-country
 * match wins and a city-only match is the fallback for when the country
 * didn't resolve at all.
 */
export function resolveNearbyCity(
  locations: LocationCountry[],
  detected: DetectedLocation | undefined,
): NearbyCity | undefined {
  if (!detected?.city) return undefined;
  const target = detected.city.toLowerCase();
  let fallback: NearbyCity | undefined;
  for (const country of locations) {
    for (const city of country.cities) {
      if (city.city.toLowerCase() !== target) continue;
      if (detected.country && country.country === detected.country) {
        return { country: country.country, city: city.city };
      }
      fallback ??= { country: country.country, city: city.city };
    }
  }
  return detected.country ? undefined : fallback;
}

/**
 * Box around a point, used when the detected city has no listings of its own:
 * searching the surrounding area still answers "what's around me", where a
 * city-name search would have returned nothing.
 */
export function boundsAround(lat: number, lng: number): NearbyBounds {
  const latDelta = NEARBY_RADIUS_KM / KM_PER_LAT_DEGREE;
  // Meridians converge toward the poles, so a fixed km radius spans more
  // longitude the further north/south it sits. Clamped so a near-polar
  // request can't blow the box up to the whole globe.
  const lngDelta = Math.min(
    latDelta / Math.max(Math.cos((lat * Math.PI) / 180), 0.2),
    45,
  );
  const round = (v: number) => Number(v.toFixed(3));
  return {
    minLat: round(Math.max(-90, lat - latDelta)),
    maxLat: round(Math.min(90, lat + latDelta)),
    minLng: round(Math.max(-180, lng - lngDelta)),
    maxLng: round(Math.min(180, lng + lngDelta)),
  };
}
