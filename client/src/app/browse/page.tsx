import type { Metadata } from "next";
import { headers } from "next/headers";
import { BrowseView } from "@/components/property/browse-view";
import { detectLocation } from "@/lib/geo/detect-location";

export const metadata: Metadata = {
  title: "Browse stays",
  description: "Search unique places to stay by city, dates, price, and amenities.",
};

/**
 * Reading `headers()` opts this subtree into dynamic rendering. Isolating it
 * here (rather than in `BrowsePage` itself) keeps the static `metadata`
 * export above unaffected — Next resolves metadata independently of how the
 * page body renders.
 */
async function DetectedBrowseView() {
  const detected = detectLocation(await headers());
  return <BrowseView detected={detected} />;
}

export default function BrowsePage() {
  return <DetectedBrowseView />;
}
