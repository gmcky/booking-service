import { describe, it, expect, beforeEach, vi } from "vitest";
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

describe("suggestAddresses", () => {
  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("maps street features and requests English names", async () => {
    fetchMock.mockResolvedValueOnce(photonResponse([streetFeature]));

    const result = await suggestAddresses("Хрещатик", 5);

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

    const result = await suggestAddresses("khresh 22", 5);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      label: "Khreshchatyk Street 22, Kyiv, Ukraine",
      houseNumber: "22",
    });
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

    await expect(suggestAddresses("street", 3)).resolves.toHaveLength(3);
  });

  it("returns empty on provider errors instead of throwing", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 502, json: async () => ({}) });

    await expect(suggestAddresses("khresh", 5)).resolves.toEqual([]);
  });
});
