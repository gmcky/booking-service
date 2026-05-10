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
    const checkIn = new Date(Date.now() + 72 * HOUR);

    const policy = calculateRefundPolicy(checkIn);

    expect(policy).toMatchObject({
      refundPercent: 100,
      daysUntilCheckIn: 3,
      isAutoApprove: false,
      hoursUntilCheckIn: 72,
      msUntilCheckIn: 72 * HOUR,
    });
  });

  it("returns 50% refund at exactly 48h (boundary - not strictly greater)", () => {
    const checkIn = new Date(Date.now() + 48 * HOUR);

    const policy = calculateRefundPolicy(checkIn);

    expect(policy).toMatchObject({
      refundPercent: 50,
      daysUntilCheckIn: 2,
      isAutoApprove: false,
      hoursUntilCheckIn: 48,
      msUntilCheckIn: 48 * HOUR,
    });
  });

  it("returns 0% refund when less than 24h remain", () => {
    const checkIn = new Date(Date.now() + 23 * HOUR + 59 * MINUTE);

    const policy = calculateRefundPolicy(checkIn);

    const expectedMs = 23 * HOUR + 59 * MINUTE;
    expect(policy).toMatchObject({
      refundPercent: 0,
      daysUntilCheckIn: 1,
      isAutoApprove: false,
      msUntilCheckIn: expectedMs,
    });
    expect(policy.hoursUntilCheckIn).toBeCloseTo(expectedMs / HOUR, 5);
  });

  it("handles negative time (check-in in the past) as 0-day, 0% refund", () => {
    const checkIn = new Date(Date.now() - 2 * HOUR);

    const policy = calculateRefundPolicy(checkIn);

    expect(policy).toMatchObject({
      refundPercent: 0,
      daysUntilCheckIn: 0,
      isAutoApprove: false,
      msUntilCheckIn: -2 * HOUR,
      hoursUntilCheckIn: -2,
    });
  });

  it("marks isAutoApprove true when check-in is more than 7 days away", () => {
    const checkIn = new Date(Date.now() + 8 * 24 * HOUR);

    const policy = calculateRefundPolicy(checkIn);

    expect(policy).toMatchObject({
      isAutoApprove: true,
      refundPercent: 100,
      daysUntilCheckIn: 8,
      hoursUntilCheckIn: 192,
      msUntilCheckIn: 8 * 24 * HOUR,
    });
  });

  it("marks isAutoApprove false when check-in is exactly 7 days away", () => {
    const checkIn = new Date(Date.now() + 7 * 24 * HOUR);

    const policy = calculateRefundPolicy(checkIn);

    expect(policy).toMatchObject({
      isAutoApprove: false,
      refundPercent: 100,
      daysUntilCheckIn: 7,
      hoursUntilCheckIn: 168,
      msUntilCheckIn: 7 * 24 * HOUR,
    });
  });

  it("keeps isAutoApprove false under 7 days with ceil rounding", () => {
    const checkIn = new Date(Date.now() + 5 * 24 * HOUR + HOUR);

    const policy = calculateRefundPolicy(checkIn);

    expect(policy).toMatchObject({
      daysUntilCheckIn: 6,
      isAutoApprove: false,
      refundPercent: 100,
      hoursUntilCheckIn: 121,
      msUntilCheckIn: 5 * 24 * HOUR + HOUR,
    });
  });
});
