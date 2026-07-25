import { headers } from "next/headers";
import { detectLocation } from "@/lib/geo/detect-location";

/**
 * Per-request geo, isolated behind a route handler.
 *
 * Reading `headers()` inside a page opts that whole route into dynamic
 * rendering: no full route cache, so every client-side navigation to it pays
 * a server round trip and paints its loading boundary first. Home used to do
 * exactly that for its "Stays near you" row. Keeping the header read here
 * lets `/` and `/browse` stay statically prerendered while the geo-dependent
 * bits fetch this after hydration.
 */
export const dynamic = "force-dynamic";

export async function GET() {
  return Response.json(detectLocation(await headers()), {
    // Per-IP by definition — must never be shared by a CDN or bfcache.
    headers: { "cache-control": "no-store" },
  });
}
