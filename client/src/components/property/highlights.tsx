import { Castle, Dog, Laptop, MapPin, Star, Waves, type LucideIcon } from "lucide-react";
import type { PropertyDetail } from "@/lib/api/properties";
import { formatRating } from "@/lib/utils/money";

interface Highlight {
  icon: LucideIcon;
  title: string;
  sub: string;
}

/**
 * Up to 3 honest highlights derived from the property's own data — no
 * fabricated claims. Renders nothing when fewer than 2 candidates match.
 */
export function Highlights({ property }: { property: PropertyDetail }) {
  const highlights = deriveHighlights(property);
  if (highlights.length < 2) return null;

  return (
    <div className="grid grid-cols-1 gap-5 border-b border-border py-6 sm:grid-cols-3">
      {highlights.map((h) => (
        <div key={h.title} className="flex items-start gap-3">
          <h.icon className="size-6 shrink-0" />
          <div>
            <p className="text-sm font-semibold">{h.title}</p>
            <p className="text-sm text-muted-foreground">{h.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

function deriveHighlights(property: PropertyDetail): Highlight[] {
  const amenities = new Set(property.amenities);
  const rating = formatRating(property.averageRating);

  const candidates: (Highlight | null)[] = [
    rating !== null && Number(rating) >= 4.8 && property.reviewCount >= 3
      ? {
          icon: Star,
          title: "Highly rated",
          sub: `Guests consistently rate this stay ${rating}★`,
        }
      : null,
    amenities.has("CITY_CENTRE")
      ? { icon: MapPin, title: "Central location", sub: "Steps from the city centre" }
      : null,
    amenities.has("BEACHFRONT") || amenities.has("SEA_VIEW")
      ? { icon: Waves, title: "By the sea", sub: "Beachfront or sea views right outside" }
      : null,
    property.petsAllowed
      ? { icon: Dog, title: "Pets welcome", sub: "Bring your furry friend along" }
      : null,
    amenities.has("WIFI") && (amenities.has("STANDING_DESK") || amenities.has("PROJECTOR"))
      ? {
          icon: Laptop,
          title: "Ready for remote work",
          sub: "Wi-Fi plus a proper desk or projector setup",
        }
      : null,
    amenities.has("HISTORIC_BUILDING")
      ? { icon: Castle, title: "Historic character", sub: "Stay in a building with real history" }
      : null,
  ];

  return candidates.filter((c): c is Highlight => c !== null).slice(0, 3);
}
