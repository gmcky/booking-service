const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Night diff with ceil semantics (partial day counts as full night). */
export function calculateNights(checkIn: Date, checkOut: Date): number {
  return Math.ceil((checkOut.getTime() - checkIn.getTime()) / MS_PER_DAY);
}
