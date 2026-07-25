"use client";

import * as React from "react";
import { useRouter, usePathname } from "next/navigation";
import { Heart } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useFavorites } from "@/components/property/use-favorites";

interface FavoriteButtonProps {
  propertyId: string;
  variant: "overlay" | "labeled";
  className?: string;
}

/**
 * Heart toggle shared by property cards (overlay, over the photo) and the
 * detail page (labeled, next to the title). Both read the same
 * useFavorites() ids query, so toggling one updates the other everywhere
 * it's rendered. Anon users are sent to /login instead of mutating.
 */
export function FavoriteButton({ propertyId, variant, className }: FavoriteButtonProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthed, isFavorite, toggle } = useFavorites();
  const active = isFavorite(propertyId);
  const label = active ? "Remove from favorites" : "Add to favorites";

  function handleClick(e: React.MouseEvent) {
    // The overlay variant always sits inside a PropertyCard's <Link>; stop
    // the click from also triggering navigation. Harmless for the labeled
    // variant, which isn't wrapped in a link.
    e.preventDefault();
    e.stopPropagation();
    if (!isAuthed) {
      router.push(`/login?returnTo=${encodeURIComponent(pathname || "/")}`);
      return;
    }
    toggle(propertyId);
  }

  if (variant === "overlay") {
    return (
      <button
        type="button"
        onClick={handleClick}
        aria-label={label}
        aria-pressed={active}
        className={cn(
          "absolute top-2.5 right-2.5 z-10 flex size-8 items-center justify-center rounded-full transition-transform active:scale-90",
          className,
        )}
      >
        <Heart
          className={cn(
            "size-5 transition-colors",
            active ? "fill-favorite stroke-favorite" : "fill-black/40 stroke-white",
          )}
        />
      </button>
    );
  }

  return (
    <Button
      variant="outline"
      onClick={handleClick}
      aria-label={label}
      aria-pressed={active}
      className={className}
    >
      <Heart className={cn(active ? "fill-favorite stroke-favorite" : "")} />
      {active ? "Saved" : "Save"}
    </Button>
  );
}
