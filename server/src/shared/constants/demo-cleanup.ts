// Seeded users the demo-cleanup cron must never touch.
// DEMO_USER_ID is intentionally NOT in this set: its data is purged daily,
// only the row is preserved so the public demo login keeps working.
export const PROTECTED_USER_IDS: ReadonlySet<string> = new Set([
  "62fef0d2-e673-46cd-b6c6-cd75f815ca62", // owner@demo.com
  "269e6eed-17f8-4836-8432-00d781c5ac87", // owner2@demo.com
  "daea86f9-7fe7-4fe3-bafe-ff6b9676ef0c", // admin@demo.com
  "4308be64-baf9-4f10-b76c-be40ca219079", // user@demo.com
  "821188b2-7de9-40b5-adca-00edd1abbc29", // user2@demo.com
  "7c7741bc-dfcb-4854-84da-4bd10e6047c6", // user3@demo.com
]);

export const DEMO_USER_ID = "17a23971-0479-46f4-a599-9e36cbee8442";
export const DEMO_CLEANUP_REPEATABLE_JOB_ID = "demo-cleanup-recurring";
