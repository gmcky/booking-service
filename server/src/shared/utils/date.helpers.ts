const MS_PER_DAY = 1000 * 60 * 60 * 24;

export function formatDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/**
 * Returns the number of nights between checkIn and checkOut.
 * Uses Math.ceil so that a partial day counts as a full night
 * (e.g. 1 day 1 hour → 2 nights).
 */
export function calculateNights(checkIn: Date, checkOut: Date): number {
  return Math.ceil((checkOut.getTime() - checkIn.getTime()) / MS_PER_DAY);
}
