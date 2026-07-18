export const MAX_STAY_NIGHTS = 90;
export const MAX_BOOKING_ADVANCE_YEARS = 1;

// How long an unpaid PENDING booking holds its dates before the cleanup
// sweep releases them. Mirrors request-to-book holds on large platforms.
export const UNPAID_EXPIRY_HOURS = 24;

// A payment stub touched within this window marks an active checkout
// session; the sweep skips it even past the expiry cutoff.
export const UNPAID_EXPIRY_GRACE_MINUTES = 60;
