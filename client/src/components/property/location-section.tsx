import { MapPin } from "lucide-react";
import type { PropertyDetail } from "@/lib/api/properties";

export function LocationSection({ property }: { property: PropertyDetail }) {
  const locality = [property.district, property.city, property.country]
    .filter((part): part is string => Boolean(part))
    .join(", ");

  return (
    <div id="location" className="scroll-mt-32 border-t border-border py-6">
      <h2 className="mb-[18px] text-[19px] font-semibold tracking-tight">Where you&apos;ll be</h2>
      <p className="flex items-center gap-2 text-[15px] font-medium">
        <MapPin className="size-[17px] shrink-0 text-muted-foreground" />
        {locality}
      </p>
      <p className="mt-1 text-sm text-muted-foreground">{property.address}</p>
    </div>
  );
}
