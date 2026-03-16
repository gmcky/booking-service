/** The four possible roles a user can have relative to a booking. */
export type BookingRole = "ADMIN" | "HOST" | "GUEST" | "NONE";

/**
 * Resolves the caller's role relative to a specific booking.
 *
 * Priority: ADMIN → HOST → GUEST → NONE
 * This order matters: an admin who also happens to own the property
 * should still be treated as ADMIN (most permissive role wins first).
 */
export function getBookingRole(
  booking: { userId: string; property: { ownerId: string } },
  userId: string,
  userRole: string,
): BookingRole {
  if (userRole === "ADMIN") return "ADMIN";
  if (booking.property.ownerId === userId) return "HOST";
  if (booking.userId === userId) return "GUEST";
  return "NONE";
}
