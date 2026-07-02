import { BASE_URL } from "@/lib/api/client";

/** Placeholder background for property/booking photos with no image yet. */
export const PHOTO_STRIPES =
  "repeating-linear-gradient(135deg,var(--muted),var(--muted) 11px,var(--background) 11px,var(--background) 22px)";

/**
 * Uploaded photos are stored as API-relative paths ("uploads/properties/…")
 * served from the API origin, while seed data carries absolute URLs.
 */
export function photoUrl(src: string): string {
  if (/^https?:\/\//.test(src)) return src;
  return `${new URL(BASE_URL).origin}/${src.replace(/^\//, "")}`;
}
