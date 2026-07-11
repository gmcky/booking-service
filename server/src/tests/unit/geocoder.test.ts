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

function hit(lat: string, lon: string) {
  return {
    ok: true,
    status: 200,
    json: async () => [{ lat, lon }],
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

  it("resolves at house precision on first hit", async () => {
    fetchMock.mockResolvedValueOnce(hit("50.4474", "30.5241"));

    const result = await geocodeAddress(address);

    expect(result).toEqual({ latitude: 50.4474, longitude: 30.5241, precision: "house" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(requestedStreet(fetchMock.mock.calls[0])).toBe("22 Khreshchatyk St");
  });

  it("falls back house → street → city", async () => {
    fetchMock
      .mockResolvedValueOnce(miss)
      .mockResolvedValueOnce(miss)
      .mockResolvedValueOnce(hit("50.4501", "30.5234"));

    const result = await geocodeAddress(address);

    expect(result).toEqual({ latitude: 50.4501, longitude: 30.5234, precision: "city" });
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

function photonResponse(features: unknown[]) {
  return { ok: true, status: 200, json: async () => ({ features }) };
}

const streetFeature = {
  geometry: { coordinates: [30.5241, 50.4474] },
  properties: {
    type: "street",
    name: "Khreshchatyk Street",
    district: "Pechersk",
    city: "Kyiv",
    country: "Ukraine",
  },
};

const streetOpts = { limit: 5, kind: "street" } as const;

describe("suggestAddresses", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("maps street features and requests English names", async () => {
    fetchMock.mockResolvedValueOnce(photonResponse([streetFeature]));

    const result = await suggestAddresses("Хрещатик", streetOpts);

    expect(result).toEqual([
      {
        label: "Khreshchatyk Street, Pechersk, Kyiv, Ukraine",
        street: "Khreshchatyk Street",
        houseNumber: null,
        district: "Pechersk",
        city: "Kyiv",
        country: "Ukraine",
        latitude: 50.4474,
        longitude: 30.5241,
      },
    ]);
    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("lang")).toBe("en");
    expect(url.searchParams.get("q")).toBe("Хрещатик");
  });

  it("appends picked city/country to the query for street lookups", async () => {
    fetchMock.mockResolvedValueOnce(photonResponse([streetFeature]));

    await suggestAddresses("Хрещатик", { ...streetOpts, city: "Kyiv", country: "Ukraine" });

    const url = new URL(String(fetchMock.mock.calls[0]?.[0]));
    expect(url.searchParams.get("q")).toBe("Хрещатик, Kyiv, Ukraine");
  });

  it("maps house features and drops non-street noise and duplicates", async () => {
    const house = {
      geometry: { coordinates: [30.53, 50.44] },
      properties: {
        type: "house",
        housenumber: "22",
        street: "Khreshchatyk Street",
        city: "Kyiv",
        country: "Ukraine",
      },
    };
    const poi = {
      geometry: { coordinates: [30.5, 50.4] },
      properties: { type: "city", name: "Kyiv", country: "Ukraine", city: "Kyiv" },
    };
    fetchMock.mockResolvedValueOnce(photonResponse([house, poi, house]));

    const result = await suggestAddresses("khresh 22", streetOpts);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      label: "Khreshchatyk Street 22, Kyiv, Ukraine",
      houseNumber: "22",
    });
  });

  it("filters street results to the picked country, falling back when none match", async () => {
    const kyivStreet = streetFeature;
    const berlinStreet = {
      geometry: { coordinates: [13.4, 52.52] },
      properties: { type: "street", name: "Hauptstrasse", city: "Berlin", country: "Germany" },
    };
    fetchMock.mockResolvedValue(photonResponse([berlinStreet, kyivStreet]));

    const filtered = await suggestAddresses("street", { ...streetOpts, country: "Ukraine" });
    expect(filtered).toHaveLength(1);
    expect(filtered[0]).toMatchObject({ country: "Ukraine" });

    // Constraint typed in another script matches nothing — better to show
    // everything than an empty dropdown.
    const fallback = await suggestAddresses("street", { ...streetOpts, country: "Україна" });
    expect(fallback).toHaveLength(2);
  });

  it("maps city features for kind=city and ignores streets", async () => {
    const cityFeature = {
      geometry: { coordinates: [30.5234, 50.4501] },
      properties: { type: "city", name: "Kyiv", country: "Ukraine" },
    };
    fetchMock.mockResolvedValueOnce(photonResponse([streetFeature, cityFeature]));

    const result = await suggestAddresses("Kyi", { limit: 5, kind: "city" });

    expect(result).toEqual([
      {
        label: "Kyiv, Ukraine",
        street: null,
        houseNumber: null,
        district: null,
        city: "Kyiv",
        country: "Ukraine",
        latitude: 50.4501,
        longitude: 30.5234,
      },
    ]);
  });

  it("caps results at the requested limit", async () => {
    const features = Array.from({ length: 8 }, (_, i) => ({
      geometry: { coordinates: [30.5 + i, 50.4] },
      properties: {
        type: "street",
        name: `Street ${i}`,
        city: "Kyiv",
        country: "Ukraine",
      },
    }));
    fetchMock.mockResolvedValueOnce(photonResponse(features));

    await expect(suggestAddresses("street", { limit: 3, kind: "street" })).resolves.toHaveLength(3);
  });

  it("returns empty on provider errors instead of throwing", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) });

    await expect(suggestAddresses("khresh", streetOpts)).resolves.toEqual([]);
  });
});
