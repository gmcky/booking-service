// Recognizes seed/demo/test-fixture email addresses so production paths
// (email delivery, verification gating) can special-case them. Broader than
// PROTECTED_EMAIL_DOMAINS in demo-cleanup.ts, which only guards the
// demo-cleanup cron against deleting seeded accounts — this is about not
// spamming real inboxes with mail addressed to fixture data.
const SEED_EMAIL_DOMAINS: ReadonlySet<string> = new Set([
  "demo.com",
  "test.com",
  "booking.dev",
  "seedhost.dev",
  "seedguest.dev",
]);

/** Matches any domain under example.* (example.com, example.org, example.co.uk, ...). */
const EXAMPLE_DOMAIN_PATTERN = /^example\./i;

/** True for seed/demo/test-fixture email addresses. Case-insensitive. */
export function isSeedEmail(email: string): boolean {
  const atIndex = email.lastIndexOf("@");
  if (atIndex === -1) return false;

  const domain = email.slice(atIndex + 1).toLowerCase();
  if (SEED_EMAIL_DOMAINS.has(domain)) return true;

  return EXAMPLE_DOMAIN_PATTERN.test(domain);
}
