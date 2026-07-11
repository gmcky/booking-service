import { env } from "../../config/env.js";
import { logger } from "./logger.js";

// District deliberately absent: Nominatim's structured query has no slot
// for it, so it never affects the result and must not trigger re-geocodes.
export interface GeocodeAddress {
  street: string;
  houseNumber?: string | null;
  city: string;
  country: string;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  /** Which query variant produced the hit — logged for observability. */
  precision: "house" | "street" | "city";
}

interface NominatimHit {
  lat: string;
  lon: string;
}

/** One selectable autocomplete entry, already normalized to English. */
export interface AddressSuggestion {
  label: string;
  street: string;
  houseNumber: string | null;
  district: string | null;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    type?: string;
    name?: string;
    housenumber?: string;
    street?: string;
    district?: string;
    city?: string;
    town?: string;
    village?: string;
    country?: string;
  };
}

/**
 * Search-as-you-type suggestions via Photon (Nominatim's usage policy
 * forbids autocomplete; Photon is OSM data built for it). `lang=en`
 * normalizes results to English regardless of the input script, so a host
 * typing "Хрещатик" is offered "Khreshchatyk Street". Only street- and
 * house-level features qualify — a suggestion must pin an exact spot.
 */
export async function suggestAddresses(query: string, limit: number): Promise<AddressSuggestion[]> {
  const url = new URL(env.PHOTON_URL);
  url.search = new URLSearchParams({
    q: query,
    lang: "en",
    // Over-fetch: non-street features get filtered out below.
    limit: String(limit * 3),
  }).toString();

  const res = await fetch(url, {
    headers: { "User-Agent": env.GEOCODER_USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    logger.warn({ status: res.status }, "Photon rejected suggestion request");
    return [];
  }

  const body = (await res.json()) as { features?: PhotonFeature[] };
  const suggestions: AddressSuggestion[] = [];
  const seen = new Set<string>();

  for (const feature of body.features ?? []) {
    const props = feature.properties ?? {};
    const [longitude, latitude] = feature.geometry?.coordinates ?? [];
    if (latitude === undefined || longitude === undefined) continue;

    const isHouse = props.type === "house" && Boolean(props.street);
    const isStreet = props.type === "street" && Boolean(props.name);
    if (!isHouse && !isStreet) continue;

    const street = (isHouse ? props.street : props.name) as string;
    const city = props.city ?? props.town ?? props.village;
    if (!city || !props.country) continue;

    const houseNumber = (isHouse && props.housenumber) || null;
    const label = [
      houseNumber ? `${street} ${houseNumber}` : street,
      props.district,
      city,
      props.country,
    ]
      .filter(Boolean)
      .join(", ");

    if (seen.has(label)) continue;
    seen.add(label);

    suggestions.push({
      label,
      street,
      houseNumber,
      district: props.district ?? null,
      city,
      country: props.country,
      latitude,
      longitude,
    });
    if (suggestions.length >= limit) break;
  }

  return suggestions;
}

async function queryNominatim(params: Record<string, string>): Promise<GeocodeResult | null> {
  const url = new URL(env.GEOCODER_URL);
  url.search = new URLSearchParams({ format: "jsonv2", limit: "1", ...params }).toString();

  const res = await fetch(url, {
    headers: { "User-Agent": env.GEOCODER_USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    // 5xx/429 are worth a BullMQ retry; anything else won't improve on retry.
    if (res.status >= 500 || res.status === 429) {
      throw new Error(`Geocoder responded ${res.status}`);
    }
    logger.warn({ status: res.status }, "Geocoder rejected request");
    return null;
  }

  const hits = (await res.json()) as NominatimHit[];
  const hit = hits[0];
  if (!hit) return null;

  const latitude = Number(hit.lat);
  const longitude = Number(hit.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

  return { latitude, longitude, precision: "house" };
}

/**
 * Resolves a structured address to coordinates, degrading gracefully:
 * house-level → street-level → city-level. Returns null only when even the
 * city can't be found. Caller is responsible for rate limiting (the geocode
 * worker runs with a 1 req/s limiter per Nominatim's usage policy).
 */
export async function geocodeAddress(address: GeocodeAddress): Promise<GeocodeResult | null> {
  const base = { city: address.city, country: address.country };

  const variants: { precision: GeocodeResult["precision"]; params: Record<string, string> }[] = [];
  if (address.houseNumber) {
    variants.push({
      precision: "house",
      params: { ...base, street: `${address.houseNumber} ${address.street}` },
    });
  }
  variants.push({ precision: "street", params: { ...base, street: address.street } });
  variants.push({ precision: "city", params: base });

  for (const variant of variants) {
    const result = await queryNominatim(variant.params);
    if (result) return { ...result, precision: variant.precision };
  }

  return null;
}
