import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { calculateRefundPolicy } from "../../modules/payments/payment.helpers.js";

const HOUR = 60 * 60 * 1000;
const MINUTE = 60 * 1000;

describe("calculateRefundPolicy", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-30T00:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 100% refund when check-in is strictly more than 48h away", () => {
    const checkIn = new Date(Date.now() + 48 * HOUR + 1);

    const policy = calculateRefundPolicy(checkIn);

    expect(policy.refundPercent).toBe(100);
  });

  it("returns 50% refund at exactly 48h (boundary - not strictly greater)", () => {
    const checkIn = new Date(Date.now() + 48 * HOUR);

    const policy = calculateRefundPolicy(checkIn);

    expect(policy.refundPercent).toBe(50);
  });

  it("returns 0% refund when less than 24h remain", () => {
    const checkIn = new Date(Date.now() + 23 * HOUR + 59 * MINUTE);

    const policy = calculateRefundPolicy(checkIn);

    expect(policy.refundPercent).toBe(0);
  });

  it("handles negative time (check-in in the past) as 0-day, 0% refund", () => {
    const checkIn = new Date(Date.now() - 2 * HOUR);

    const policy = calculateRefundPolicy(checkIn);

    expect(policy.refundPercent).toBe(0);
    expect(policy.daysUntilCheckIn).toBe(0);
    expect(policy.hoursUntilCheckIn).toBeLessThan(0);
  });

  it("marks isAutoApprove true when check-in is more than 7 days away", () => {
    const checkIn = new Date(Date.now() + 8 * 24 * HOUR);

    const policy = calculateRefundPolicy(checkIn);

    expect(policy.isAutoApprove).toBe(true);
  });

  it("marks isAutoApprove false when check-in is exactly 7 days away", () => {
    const checkIn = new Date(Date.now() + 7 * 24 * HOUR);

    const policy = calculateRefundPolicy(checkIn);

    expect(policy.isAutoApprove).toBe(false);
  });

  it("keeps isAutoApprove false under 7 days with ceil rounding", () => {
    const checkIn = new Date(Date.now() + 5 * 24 * HOUR + HOUR);

    const policy = calculateRefundPolicy(checkIn);

    expect(policy.daysUntilCheckIn).toBe(6);
    expect(policy.isAutoApprove).toBe(false);
  });
});
