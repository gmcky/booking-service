import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { calculateRefundPreview } from "@/lib/utils/refund";

const NOW = new Date("2026-07-10T00:00:00.000Z");

function checkInHoursFromNow(hours: number): string {
  return new Date(NOW.getTime() + hours * 60 * 60 * 1000).toISOString();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("calculateRefundPreview", () => {
  it("gives a full refund when check-in is more than 48h away", () => {
    const result = calculateRefundPreview(checkInHoursFromNow(72), 200);
    expect(result.refundPercent).toBe(100);
    expect(result.refundAmount).toBe(200);
  });

  it("gives a 50% refund at exactly 48h (threshold is exclusive for full)", () => {
    const result = calculateRefundPreview(checkInHoursFromNow(48), 200);
    expect(result.refundPercent).toBe(50);
    expect(result.refundAmount).toBe(100);
  });

  it("gives a 50% refund between 24h and 48h", () => {
    const result = calculateRefundPreview(checkInHoursFromNow(36), 200);
    expect(result.refundPercent).toBe(50);
    expect(result.refundAmount).toBe(100);
  });

  it("gives a 50% refund at exactly 24h (threshold is inclusive for partial)", () => {
    const result = calculateRefundPreview(checkInHoursFromNow(24), 200);
    expect(result.refundPercent).toBe(50);
    expect(result.refundAmount).toBe(100);
  });

  it("gives no refund under 24h", () => {
    const result = calculateRefundPreview(checkInHoursFromNow(12), 200);
    expect(result.refundPercent).toBe(0);
    expect(result.refundAmount).toBe(0);
  });

  it("accepts a string totalPrice", () => {
    const result = calculateRefundPreview(checkInHoursFromNow(72), "200");
    expect(result.refundPercent).toBe(100);
    expect(result.refundAmount).toBe(200);
  });

  it("accepts a numeric totalPrice", () => {
    const result = calculateRefundPreview(checkInHoursFromNow(72), 200);
    expect(result.refundPercent).toBe(100);
    expect(result.refundAmount).toBe(200);
  });
});
