export { formatDate } from "../../shared/utils/date.helpers.js";
export {
  getMetadataObject,
  getAuditObject,
  getStripePayloadObject,
  toInputJsonObject,
} from "../../shared/utils/prisma.helpers.js";

export const REFUND_POLICY = {
  autoApproveAfterDays: 7,
  fullRefundAfterHours: 48,
  partialRefundAfterHours: 24,
  partialRefundPercent: 50,
} as const;

export function toFiniteNumber(value: unknown): number | null {
  const parsed =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number(value)
        : NaN;

  return Number.isFinite(parsed) ? parsed : null;
}

export function calculateRefundPolicy(checkIn: Date) {
  const msUntilCheckIn = checkIn.getTime() - Date.now();
  const hoursUntilCheckIn = msUntilCheckIn / (1000 * 60 * 60);
  const daysUntilCheckIn = Math.max(0, Math.ceil(hoursUntilCheckIn / 24));
  const isAutoApprove = daysUntilCheckIn > REFUND_POLICY.autoApproveAfterDays;

  let refundPercent = 0;
  if (hoursUntilCheckIn > REFUND_POLICY.fullRefundAfterHours) {
    refundPercent = 100;
  } else if (hoursUntilCheckIn >= REFUND_POLICY.partialRefundAfterHours) {
    refundPercent = REFUND_POLICY.partialRefundPercent;
  }

  return {
    msUntilCheckIn,
    hoursUntilCheckIn,
    daysUntilCheckIn,
    refundPercent,
    isAutoApprove,
  };
}
