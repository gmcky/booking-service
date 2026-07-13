// Seeded users the demo-cleanup cron must never touch, identified by email.
// User IDs are minted fresh on every reseed, so hardcoded UUIDs go stale —
// a stale set once let the cron hard-delete the entire seeded dataset.
// DEMO_USER_EMAIL is intentionally NOT protected: its data is purged daily,
// only the row is preserved so the public demo login keeps working.
export const DEMO_USER_EMAIL = "demo@booking.dev";

export const PROTECTED_EMAILS: ReadonlySet<string> = new Set([
  "owner@demo.com",
  "owner2@demo.com",
  "admin@demo.com",
  "user@demo.com",
  "user2@demo.com",
  "user3@demo.com",
]);

// Seeded hosts and guests share these domains (see prisma/seed-data).
export const PROTECTED_EMAIL_DOMAINS: readonly string[] = ["seedhost.dev", "seedguest.dev"];

export const DEMO_CLEANUP_REPEATABLE_JOB_ID = "demo-cleanup-recurring";
