/** Mirrors server/src/modules/payments/payment.helpers.ts calculateRefundPolicy exactly. */
export const FULL_REFUND_AFTER_HOURS = 48;
export const PARTIAL_REFUND_AFTER_HOURS = 24;
const PARTIAL_REFUND_PERCENT = 50;

export interface RefundPreview {
  refundPercent: 0 | 50 | 100;
  refundAmount: number;
  hoursUntilCheckIn: number;
}

export function calculateRefundPreview(checkIn: string, totalPrice: string | number): RefundPreview {
  const hoursUntilCheckIn = (new Date(checkIn).getTime() - Date.now()) / (1000 * 60 * 60);

  let refundPercent: RefundPreview["refundPercent"] = 0;
  if (hoursUntilCheckIn > FULL_REFUND_AFTER_HOURS) {
    refundPercent = 100;
  } else if (hoursUntilCheckIn >= PARTIAL_REFUND_AFTER_HOURS) {
    refundPercent = PARTIAL_REFUND_PERCENT;
  }

  const price = typeof totalPrice === "string" ? Number(totalPrice) : totalPrice;
  return { refundPercent, refundAmount: (price * refundPercent) / 100, hoursUntilCheckIn };
}
