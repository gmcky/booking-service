/**
 * Local-date (not UTC) ISO date string, e.g. "2026-07-02". Using
 * toISOString().slice(0, 10) shifts dates across midnight in negative UTC
 * offsets — this reads the local calendar fields directly instead.
 */
export function toISODate(date?: Date): string | undefined {
  return date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
      ).padStart(2, "0")}`
    : undefined;
}

export function nightsBetween(checkIn?: Date, checkOut?: Date): number;
export function nightsBetween(checkIn?: string, checkOut?: string): number;
export function nightsBetween(checkIn?: Date | string, checkOut?: Date | string): number {
  if (!checkIn || !checkOut) return 0;
  const a = checkIn instanceof Date ? checkIn : new Date(checkIn);
  const b = checkOut instanceof Date ? checkOut : new Date(checkOut);
  const ms = b.getTime() - a.getTime();
  return ms > 0 ? Math.round(ms / 86_400_000) : 0;
}

export function formatRange(checkIn: string, checkOut: string): string {
  const a = new Date(checkIn);
  const b = new Date(checkOut);
  const month = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${month(a)} – ${month(b)}, ${b.getFullYear()}`;
}

/** Backend expects ISO datetime; query params carry date-only strings. */
export function toISODateTime(date: string): string {
  return new Date(`${date}T00:00:00.000Z`).toISOString();
}

/**
 * Date part of an ISO datetime as local midnight. new Date(iso) would land
 * on the previous calendar day in negative UTC offsets.
 */
export function isoToLocalDate(iso: string): Date {
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d);
}
