import Link from "next/link";
import { Star } from "lucide-react";
import type { Property } from "@/lib/api/properties";
import { formatPrice, formatRating } from "@/lib/utils/money";
import { PHOTO_STRIPES, photoUrl } from "@/lib/utils/photo";
import { FavoriteButton } from "@/components/property/favorite-button";
import { cn } from "@/lib/utils";

/**
 * Only the fields the card renders. `Property` (search results, PropertyWithOwner)
 * and `Favorite["property"]` (schema's plain `Property`, no `owner`) both satisfy
 * this, so the same card works for both without an unsafe cast at the call site.
 */
type PropertyCardData = Pick<
  Property,
  "id" | "title" | "city" | "pricePerNight" | "averageRating" | "images"
>;

export function PropertyCard({
  property,
  highlighted = false,
  onHoverChange,
  onNavigate,
}: {
  property: PropertyCardData;
  /** Ring highlight driven by hovering the matching pin on the browse map. */
  highlighted?: boolean;
  onHoverChange?: (hovering: boolean) => void;
  /**
   * Fires when the card is actually followed (the favourite button stops the
   * event, so it doesn't count). Overlays that own a history entry use it to
   * hand that entry over before the navigation happens.
   */
  onNavigate?: () => void;
}) {
  const rating = formatRating(property.averageRating);

  return (
    <Link
      href={`/properties/${property.id}`}
      onMouseEnter={() => onHoverChange?.(true)}
      onMouseLeave={() => onHoverChange?.(false)}
      onClick={() => onNavigate?.()}
      className={cn(
        "group block overflow-hidden rounded-xl border border-border bg-card transition duration-300 ease-in-out hover:-translate-y-1 hover:border-ring hover:shadow-md motion-reduce:transition-none motion-reduce:hover:translate-y-0",
        highlighted && "border-ring shadow-sm ring-2 ring-ring",
      )}
    >
      <div
        className="relative flex aspect-[4/3] items-center justify-center overflow-hidden"
        style={{ backgroundImage: PHOTO_STRIPES }}
      >
        <FavoriteButton propertyId={property.id} variant="overlay" />
        {property.images[0] ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={photoUrl(property.images[0])}
            alt={property.title}
            className="size-full object-cover transition duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
          />
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground">
            no photo
          </span>
        )}
      </div>
      <div className="px-4 pt-3.5 pb-4">
        <div className="flex min-h-[2lh] items-start justify-between gap-2">
          <span className="line-clamp-2 text-[15px] font-semibold leading-snug">
            {property.title}
          </span>
          {rating ? (
            <span className="inline-flex shrink-0 items-center gap-1 text-[13px] leading-snug">
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
