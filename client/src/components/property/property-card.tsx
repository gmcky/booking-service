import Link from "next/link";
import { Star } from "lucide-react";
import type { Property } from "@/lib/api/properties";
import { formatPrice, formatRating } from "@/lib/utils/money";
import { PHOTO_STRIPES } from "@/lib/utils/photo";

export function PropertyCard({ property }: { property: Property }) {
  const rating = formatRating(property.averageRating);

  return (
    <Link
      href={`/properties/${property.id}`}
      className="block overflow-hidden rounded-xl border border-border bg-card transition-[box-shadow,border-color] hover:border-ring hover:shadow-sm"
    >
      <div
        className="relative flex aspect-[4/3] items-center justify-center"
        style={{ backgroundImage: PHOTO_STRIPES }}
      >
        {property.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={property.images[0]}
            alt={property.title}
            className="size-full object-cover"
          />
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground">
            no photo
          </span>
        )}
      </div>
      <div className="px-4 pt-3.5 pb-4">
        <div className="flex items-center justify-between gap-2">
          <span className="text-[15px] font-semibold">{property.title}</span>
          {rating ? (
            <span className="inline-flex items-center gap-1 text-[13px]">
              <Star className="size-3.5 fill-current" />
              {rating}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 text-sm text-muted-foreground">{property.city}</div>
        <div className="mt-2.5 text-sm">
          <strong className="font-semibold">{formatPrice(property.pricePerNight)}</strong>{" "}
          <span className="text-muted-foreground">night</span>
        </div>
      </div>
    </Link>
  );
}
