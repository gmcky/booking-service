import { describe, it, expect, beforeEach, vi } from "vitest";

// Real config/env validates the full env at import time and CI has no .env —
// every other unit suite dodges it by mocking the modules that pull it in.
vi.mock("../../config/env.js", () => ({
  env: {
    GEOCODER_URL: "https://geocoder.test/search",
    GEOCODER_USER_AGENT: "test-agent/1.0",
    PHOTON_URL: "https://photon.test/api",
  },
}));

vi.mock("../../shared/lib/logger.js", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { geocodeAddress, suggestAddresses } from "../../shared/lib/geocoder.js";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

// --- Nominatim (geocodeAddress) ---------------------------------------------

function hit(lat: string, lon: string, address: Record<string, string> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => [{ lat, lon, address }],
  };
}

const miss = {
  ok: true,
  status: 200,
  json: async () => [],
};

const address = {
  street: "Khreshchatyk St",
  houseNumber: "22",
  city: "Kyiv",
  country: "Ukraine",
};

function requestedStreet(call: unknown[] | undefined): string | null {
  if (!call) return null;
  return new URL(String(call[0])).searchParams.get("street");
}

describe("geocodeAddress", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("resolves at house precision and returns the English canonical", async () => {
    fetchMock.mockResolvedValueOnce(
      hit("50.4474", "30.5241", {
        road: "Khreshchatyk Street",
        suburb: "Pechersk",
        city: "Kyiv",
        country: "Ukraine",
      }),
    );

    const result = await geocodeAddress(address);

    expect(result).toEqual({
      latitude: 50.4474,
      longitude: 30.5241,
      precision: "house",
      canonical: {
        street: "Khreshchatyk Street",
        district: "Pechersk",
        city: "Kyiv",
        country: "Ukraine",
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("street")).toBe("22 Khreshchatyk St");
    expect(url.searchParams.get("accept-language")).toBe("en");
    expect(url.searchParams.get("addressdetails")).toBe("1");
  });

  it("falls back house → street → city", async () => {
    fetchMock
      .mockResolvedValueOnce(miss)
      .mockResolvedValueOnce(miss)
      .mockResolvedValueOnce(hit("50.4501", "30.5234", { city: "Kyiv", country: "Ukraine" }));

    const result = await geocodeAddress(address);

    expect(result).toMatchObject({
      latitude: 50.4501,
      longitude: 30.5234,
      precision: "city",
      canonical: { street: null, city: "Kyiv", country: "Ukraine" },
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(requestedStreet(fetchMock.mock.calls[1])).toBe("Khreshchatyk St");
    expect(requestedStreet(fetchMock.mock.calls[2])).toBeNull();
  });

  it("skips the house variant when houseNumber is absent", async () => {
    fetchMock.mockResolvedValueOnce(hit("50.45", "30.52"));

    const result = await geocodeAddress({ ...address, houseNumber: null });

    expect(result?.precision).toBe("street");
    expect(requestedStreet(fetchMock.mock.calls[0])).toBe("Khreshchatyk St");
  });

  it("returns null when nothing resolves", async () => {
    fetchMock.mockResolvedValue(miss);

    await expect(geocodeAddress(address)).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("throws on 5xx so BullMQ retries the job", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => ({}) });

    await expect(geocodeAddress(address)).rejects.toThrow("Geocoder responded 503");
  });

  it("treats 4xx as a permanent miss and falls through to the next variant", async () => {
    fetchMock
      .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) })
      .mockResolvedValueOnce(hit("50.45", "30.52"));

    const result = await geocodeAddress(address);

    expect(result?.precision).toBe("street");
  });
});

// --- Photon (suggestAddresses) -----------------------------------------------
// Every call fires two upstream requests (lang=default, then lang=en) that
// merge by OSM id: local names for display, English canonical for storage.

function photonResponse(features: unknown[]) {
  return { ok: true, status: 200, json: async () => ({ features }) };
}

function feature(
  osmId: number,
  props: Record<string, unknown>,
  coords: [number, number] = [30.5241, 50.4474],
) {
  return {
    geometry: { coordinates: coords },
    properties: { osm_type: "W", osm_id: osmId, ...props },
  };
}

const localStreet = feature(1, {
  type: "street",
  name: "Хрещатик",
  district: "Печерськ",
  city: "Київ",
  country: "Україна",
});
const enStreet = feature(1, {
  type: "street",
  name: "Khreshchatyk Street",
  district: "Pechersk",
  city: "Kyiv",
  country: "Ukraine",
});

const streetOpts = { limit: 5, kind: "street" } as const;

describe("suggestAddresses", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("shows local names and carries the English canonical, merged by OSM id", async () => {
    fetchMock
      .mockResolvedValueOnce(photonResponse([localStreet]))
      .mockResolvedValueOnce(photonResponse([enStreet]));

    const result = await suggestAddresses("Хрещатик", streetOpts);

    expect(result).toEqual([
      {
        label: "Хрещатик, Печерськ, Київ, Україна",
        street: "Хрещатик",
        houseNumber: null,
        district: "Печерськ",
        city: "Київ",
        country: "Україна",
        en: {
          street: "Khreshchatyk Street",
          district: "Pechersk",
          city: "Kyiv",
          country: "Ukraine",
        },
        latitude: 50.4474,
        longitude: 30.5241,
      },
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const langs = fetchMock.mock.calls.map((c) => new URL(String(c[0])).searchParams.get("lang"));
    expect(langs).toEqual(["default", "en"]);
  });

  it("never merges id-less features — each falls back to its own local name", async () => {
    const idlessLocal = {
      geometry: { coordinates: [30.5, 50.4] },
      properties: { type: "street", name: "Вулиця Один", city: "Київ", country: "Україна" },
    };
    const idlessEnOther = {
      geometry: { coordinates: [99.9, 9.9] },
      properties: {
        type: "street",
        name: "Some Other Street",
        city: "Bangkok",
        country: "Thailand",
      },
    };
    fetchMock
      .mockResolvedValueOnce(photonResponse([idlessLocal]))
      .mockResolvedValueOnce(photonResponse([idlessEnOther]));

    const result = await suggestAddresses("вулиця", streetOpts);

    // The unrelated id-less English feature must not become this entry's canonical.
    expect(result[0]?.en).toMatchObject({ street: "Вулиця Один", city: "Київ" });
  });

  it("falls back to local names when the English variant is missing", async () => {
    fetchMock
      .mockResolvedValueOnce(photonResponse([localStreet]))
      .mockResolvedValueOnce(photonResponse([]));

    const result = await suggestAddresses("Хрещатик", streetOpts);

    expect(result[0]?.en).toEqual({
      street: "Хрещатик",
      district: "Печерськ",
      city: "Київ",
      country: "Україна",
    });
  });

  it("appends picked city/country to the query for street lookups", async () => {
    fetchMock.mockResolvedValue(photonResponse([]));

    await suggestAddresses("Хрещатик", { ...streetOpts, city: "Kyiv", country: "Ukraine" });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("q")).toBe("Хрещатик, Kyiv, Ukraine");
  });

  it("filters by picked country against local OR English names, with fallback", async () => {
    const localBerlin = feature(
      2,
      { type: "street", name: "Hauptstrasse", city: "Berlin", country: "Deutschland" },
      [13.4, 52.52],
    );
    const enBerlin = feature(
      2,
      { type: "street", name: "Hauptstrasse", city: "Berlin", country: "Germany" },
      [13.4, 52.52],
    );
    fetchMock
      .mockResolvedValueOnce(photonResponse([localBerlin, localStreet]))
      .mockResolvedValueOnce(photonResponse([enBerlin, enStreet]));

    // English constraint matches the en side of the Ukrainian entry.
    const filtered = await suggestAddresses("street", { ...streetOpts, country: "Ukraine" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]?.en.country).toBe("Ukraine");

    // A constraint matching nothing keeps everything rather than emptying.
    fetchMock
      .mockResolvedValueOnce(photonResponse([localBerlin, localStreet]))
      .mockResolvedValueOnce(photonResponse([enBerlin, enStreet]));
    const fallback = await suggestAddresses("street", { ...streetOpts, country: "Polska" });
    expect(fallback).toHaveLength(2);
  });

  it("maps city features for kind=city and ignores streets", async () => {
    const localCity = feature(
      3,
      { type: "city", name: "Львів", country: "Україна" },
      [24.03, 49.84],
    );
    const enCity = feature(3, { type: "city", name: "Lviv", country: "Ukraine" }, [24.03, 49.84]);
    fetchMock
      .mockResolvedValueOnce(photonResponse([localStreet, localCity]))
      .mockResolvedValueOnce(photonResponse([enStreet, enCity]));

    const result = await suggestAddresses("Льв", { limit: 5, kind: "city" });

    expect(result).toEqual([
      {
        label: "Львів, Україна",
        street: null,
        houseNumber: null,
        district: null,
        city: "Львів",
        country: "Україна",
        en: { street: null, district: null, city: "Lviv", country: "Ukraine" },
        latitude: 49.84,
        longitude: 24.03,
      },
    ]);
  });

  it("caps results at the requested limit", async () => {
    const features = Array.from({ length: 8 }, (_, i) =>
      feature(10 + i, { type: "street", name: `Street ${i}`, city: "Kyiv", country: "Ukraine" }, [
        30.5 + i,
        50.4,
      ]),
    );
    fetchMock
      .mockResolvedValueOnce(photonResponse(features))
      .mockResolvedValueOnce(photonResponse(features));

    await expect(suggestAddresses("street", { limit: 3, kind: "street" })).resolves.toHaveLength(3);
  });

  it("returns empty on provider errors instead of throwing", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => ({}) });

    await expect(suggestAddresses("khresh", streetOpts)).resolves.toEqual([]);
  });
});
