/** Mirrors server/src/modules/reviews/review.service.ts window constants exactly. */
export const REVIEW_CREATE_WINDOW_DAYS = 30;
export const REVIEW_EDIT_WINDOW_DAYS = 7;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReviewEligibility {
  eligible: boolean;
  daysRemaining: number;
}

/** checkOut date used is actualCheckOutAt ?? checkOut, same fallback as the backend. */
export function reviewEligibility(
  actualCheckOutAt: string | null,
  checkOut: string,
): ReviewEligibility {
  const checkoutDate = new Date(actualCheckOutAt ?? checkOut);
  const elapsedMs = Date.now() - checkoutDate.getTime();
  const windowMs = REVIEW_CREATE_WINDOW_DAYS * DAY_MS;
  const daysRemaining = Math.max(0, Math.ceil((windowMs - elapsedMs) / DAY_MS));
  return { eligible: elapsedMs <= windowMs, daysRemaining };
}

export function canEditReview(createdAt: string): boolean {
  const elapsedMs = Date.now() - new Date(createdAt).getTime();
  return elapsedMs <= REVIEW_EDIT_WINDOW_DAYS * DAY_MS;
}
