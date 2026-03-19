/** Roles a user can have relative to a booking. */
export type BookingRole = "ADMIN" | "HOST" | "GUEST" | "NONE";

/**
 * Resolve the caller role relative to a booking.
 *
 * Priority: ADMIN → HOST → GUEST → NONE.
 * This order ensures administrator privileges are not shadowed by ownership.
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
