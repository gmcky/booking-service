import { describe, it, expect, beforeEach, vi } from "vitest";
import { geocodeAddress } from "../../shared/lib/geocoder.js";

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
  district: "Pechersk",
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
