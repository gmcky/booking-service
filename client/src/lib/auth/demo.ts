// The shared public demo account. The backend rejects password change, email
// change, and account deletion for it (returns 403) so a visitor can't break
// the login for everyone; the UI mirrors that by disabling those controls.
// Keep in sync with server DEMO_USER_EMAIL.
export const DEMO_USER_EMAIL = "demo@booking.dev";

export function isDemoUser(email: string | null | undefined): boolean {
  return email === DEMO_USER_EMAIL;
}
