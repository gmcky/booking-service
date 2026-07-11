"use client";

import dynamic from "next/dynamic";
import { MapPin } from "lucide-react";
import type { PropertyDetail } from "@/lib/api/properties";
import { formatStreetAddress } from "@/lib/utils/address";

const WhereYoullBeMap = dynamic(
  () => import("./where-youll-be-map").then((m) => m.WhereYoullBeMap),
  {
    ssr: false,
    loading: () => <div className="h-[420px] w-full animate-pulse rounded-xl bg-muted" />,
  },
);

/**
 * Full-width map pinning the property's location. Renders nothing when the
 * property has no coordinates (e.g. listings created before geocoding, or
 * without an address that resolved) — the plain address text still lives
 * alongside it, unaffected.
 */
export function WhereYoullBe({ property }: { property: PropertyDetail }) {
  if (property.latitude == null || property.longitude == null) return null;

  const locality = [property.district, property.city, property.country]
    .filter((part): part is string => Boolean(part))
    .join(", ");

  return (
    <div id="location" className="scroll-mt-32 border-t border-border py-6">
      <h2 className="mb-1 text-[19px] font-semibold tracking-tight">Where you&apos;ll be</h2>
      <p className="mb-[18px] text-sm text-muted-foreground">
        {property.city}, {property.country}
      </p>

      <WhereYoullBeMap latitude={property.latitude} longitude={property.longitude} />

      <p className="mt-4 flex items-center gap-2 text-[15px] font-medium">
        <MapPin className="size-[17px] shrink-0 text-muted-foreground" />
        {locality}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{formatStreetAddress(property)}</p>
    </div>
  );
}
