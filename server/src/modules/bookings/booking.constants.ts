export const MAX_STAY_NIGHTS = 90;
export const MAX_BOOKING_ADVANCE_YEARS = 1;

// How long an unpaid PENDING booking holds its dates before the cleanup
// sweep releases them. Mirrors request-to-book holds on large platforms.
export const UNPAID_EXPIRY_HOURS = 24;

// Payment is due by check-in. checkIn is stored as midnight of the check-in
// day, so a same-day booking is "past check-in" the moment it is created;
// this grace gives it a short window to pay instead of dying instantly.
export const UNPAID_CHECKIN_GRACE_HOURS = 3;

// A payment stub touched within this window marks an active checkout
// session; the sweep skips it even past the expiry cutoff.
export const UNPAID_EXPIRY_GRACE_MINUTES = 60;

// Refund-velocity penalty box: this many refunded guest cancellations
// within the window blocks further booking for the rest of the window.
// Free-cancellation policies are book-refund-repeat abuseable otherwise
// (each cycle locks inventory and burns the processing fee).
export const REFUND_ABUSE_MAX_CANCELLATIONS = 3;
export const REFUND_ABUSE_WINDOW_DAYS = 30;
