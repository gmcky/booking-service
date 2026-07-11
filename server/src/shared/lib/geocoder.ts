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

/** English names of the resolved place — used to canonicalize free-typed
 *  addresses (e.g. Cyrillic input) into English for storage. */
export interface CanonicalAddress {
  street: string | null;
  district: string | null;
  city: string | null;
  country: string | null;
}

export interface GeocodeResult {
  latitude: number;
  longitude: number;
  /** Which query variant produced the hit — logged for observability. */
  precision: "house" | "street" | "city";
  canonical: CanonicalAddress;
}

interface NominatimHit {
  lat: string;
  lon: string;
  address?: Record<string, string | undefined>;
}

/** English canonical of a suggestion — what actually gets stored. */
export interface AddressSuggestionEn {
  street: string | null;
  district: string | null;
  city: string;
  country: string;
}

/** One selectable autocomplete entry. Display fields carry the place's
 *  local name (what the host recognizes while typing); `en` carries the
 *  English canonical the client submits for storage. `street` is null for
 *  city-kind suggestions. */
export interface AddressSuggestion {
  label: string;
  street: string | null;
  houseNumber: string | null;
  district: string | null;
  city: string;
  country: string;
  en: AddressSuggestionEn;
  latitude: number;
  longitude: number;
}

export interface SuggestOptions {
  limit: number;
  /** "street" (default) matches streets and houses; "city" matches places. */
  kind: "street" | "city";
  /** Narrow results to the country / city the host already picked. */
  country?: string;
  city?: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: {
    osm_type?: string;
    osm_id?: number;
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

interface MappedFeature {
  /** Identity across the two language variants of the same OSM object;
   *  null when Photon omits the OSM id — such entries never merge (their
   *  English canonical falls back to the local name) so that two id-less
   *  features can't be mistaken for each other. */
  key: string | null;
  street: string | null;
  houseNumber: string | null;
  district: string | null;
  city: string;
  country: string;
  latitude: number;
  longitude: number;
}

function mapFeature(feature: PhotonFeature, kind: SuggestOptions["kind"]): MappedFeature | null {
  const props = feature.properties ?? {};
  const [longitude, latitude] = feature.geometry?.coordinates ?? [];
  if (latitude === undefined || longitude === undefined || !props.country) return null;

  const key =
    props.osm_type !== undefined && props.osm_id !== undefined
      ? `${props.osm_type}:${props.osm_id}`
      : null;

  if (kind === "city") {
    if (!props.name || !["city", "town", "village"].includes(props.type ?? "")) return null;
    return {
      key,
      street: null,
      houseNumber: null,
      district: null,
      city: props.name,
      country: props.country,
      latitude,
      longitude,
    };
  }

  const isHouse = props.type === "house" && Boolean(props.street);
  const isStreet = props.type === "street" && Boolean(props.name);
  if (!isHouse && !isStreet) return null;

  const street = (isHouse ? props.street : props.name) as string;
  const city = props.city ?? props.town ?? props.village;
  if (!city) return null;

  return {
    key,
    street,
    houseNumber: (isHouse && props.housenumber) || null,
    district: props.district ?? null,
    city,
    country: props.country,
    latitude,
    longitude,
  };
}

function buildLabel(entry: MappedFeature, kind: SuggestOptions["kind"]): string {
  if (kind === "city") return `${entry.city}, ${entry.country}`;
  return [
    entry.houseNumber ? `${entry.street} ${entry.houseNumber}` : entry.street,
    entry.district,
    entry.city,
    entry.country,
  ]
    .filter(Boolean)
    .join(", ");
}

/** Keeps only entries matching `expected` (case-insensitive, against the
 *  local OR English name) — unless that would empty the list: hosts may
 *  have typed the constraint in yet another language, and wrong-country
 *  suggestions beat none at all. */
function preferMatching(
  entries: AddressSuggestion[],
  field: "country" | "city",
  expected: string | undefined,
): AddressSuggestion[] {
  if (!expected) return entries;
  const target = expected.trim().toLowerCase();
  if (!target) return entries;
  const matching = entries.filter(
    (e) => e[field].toLowerCase() === target || e.en[field].toLowerCase() === target,
  );
  return matching.length > 0 ? matching : entries;
}

async function fetchPhoton(q: string, lang: string, limit: number): Promise<PhotonFeature[]> {
  const url = new URL(env.PHOTON_URL);
  url.search = new URLSearchParams({ q, lang, limit: String(limit) }).toString();

  const res = await fetch(url, {
    headers: { "User-Agent": env.GEOCODER_USER_AGENT },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    logger.warn({ status: res.status, lang }, "Photon rejected suggestion request");
    return [];
  }

  const body = (await res.json()) as { features?: PhotonFeature[] };
  return body.features ?? [];
}

/**
 * Search-as-you-type suggestions via Photon (Nominatim's usage policy
 * forbids autocomplete; Photon is OSM data built for it). Fetched in two
 * languages and merged by OSM id: `default` supplies the local names the
 * dropdown shows (a host typing "Хрещатик" sees "Хрещатик"), `en` supplies
 * the English canonical (`en` block) the client stores on publish. Street
 * suggestions must pin an exact spot; city suggestions seed city/country.
 */
export async function suggestAddresses(
  query: string,
  options: SuggestOptions,
): Promise<AddressSuggestion[]> {
  // Already-picked fields sharpen Photon's free-text ranking.
  const q = [query, options.kind === "street" ? options.city : undefined, options.country]
    .filter(Boolean)
    .join(", ");

  // Over-fetch: non-matching feature types get filtered out below.
  const upstreamLimit = options.limit * 3;
  const [localFeatures, enFeatures] = await Promise.all([
    fetchPhoton(q, "default", upstreamLimit),
    fetchPhoton(q, "en", upstreamLimit),
  ]);

  const enByKey = new Map<string, MappedFeature>();
  for (const feature of enFeatures) {
    const mapped = mapFeature(feature, options.kind);
    if (mapped?.key) enByKey.set(mapped.key, mapped);
  }

  let entries: AddressSuggestion[] = [];
  for (const feature of localFeatures) {
    const local = mapFeature(feature, options.kind);
    if (!local) continue;
    // OSM objects without an English name (or without an id to merge on)
    // fall back to their local one.
    const en = (local.key ? enByKey.get(local.key) : undefined) ?? local;
    entries.push({
      label: buildLabel(local, options.kind),
      street: local.street,
      houseNumber: local.houseNumber,
      district: local.district,
      city: local.city,
      country: local.country,
      en: { street: en.street, district: en.district, city: en.city, country: en.country },
      latitude: local.latitude,
      longitude: local.longitude,
    });
  }

  entries = preferMatching(entries, "country", options.country);
  if (options.kind === "street") {
    entries = preferMatching(entries, "city", options.city);
  }

  const seen = new Set<string>();
  const suggestions: AddressSuggestion[] = [];
  for (const entry of entries) {
    if (seen.has(entry.label)) continue;
    seen.add(entry.label);
    suggestions.push(entry);
    if (suggestions.length >= options.limit) break;
  }

  return suggestions;
}

async function queryNominatim(params: Record<string, string>): Promise<GeocodeResult | null> {
  const url = new URL(env.GEOCODER_URL);
  url.search = new URLSearchParams({
    format: "jsonv2",
    limit: "1",
    addressdetails: "1",
    "accept-language": "en",
    ...params,
  }).toString();

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

  const address = hit.address ?? {};
  return {
    latitude,
    longitude,
    precision: "house",
    canonical: {
      street: address.road ?? null,
      district:
        address.suburb ?? address.city_district ?? address.borough ?? address.quarter ?? null,
      city: address.city ?? address.town ?? address.village ?? address.municipality ?? null,
      country: address.country ?? null,
    },
  };
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
