export type BookingRole = "ADMIN" | "HOST" | "GUEST" | "NONE";

// Privilege order matters: admin must not be shadowed by host/guest ownership.
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
