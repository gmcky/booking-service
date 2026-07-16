"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Amenity, PropertyQuery } from "@/lib/api/properties";
import { cn } from "@/lib/utils";

type QuickChip =
  | { kind: "amenity"; amenity: Amenity; label: string }
  | { kind: "pets"; label: string };

const QUICK_CHIPS: QuickChip[] = [
  { kind: "amenity", amenity: "WASHER", label: "Washer" },
  { kind: "amenity", amenity: "KITCHEN", label: "Kitchen" },
  { kind: "amenity", amenity: "WIFI", label: "Wifi" },
  { kind: "pets", label: "Allows pets" },
  { kind: "amenity", amenity: "PARKING", label: "Free parking" },
  { kind: "amenity", amenity: "TV", label: "TV" },
  { kind: "amenity", amenity: "AIR_CONDITIONING", label: "Air conditioning" },
  { kind: "amenity", amenity: "POOL", label: "Pool" },
];

export interface QuickFiltersProps {
  filters: PropertyQuery;
  activeFilterCount: number;
  onApply: (next: PropertyQuery) => void;
  onOpenFilters: () => void;
}

function isChipActive(chip: QuickChip, filters: PropertyQuery): boolean {
  return chip.kind === "pets"
    ? Boolean(filters.petsAllowed)
    : Boolean(filters.amenities?.includes(chip.amenity));
}

export function QuickFilters({ filters, activeFilterCount, onApply, onOpenFilters }: QuickFiltersProps) {
  const scrollerRef = React.useRef<HTMLDivElement>(null);
  // Chips scroll horizontally with the scrollbar hidden — without a fade at
  // the clipped edge the row looks abruptly cut off by whatever sits next
  // to it (e.g. the map panel in split view).
  const [clippedRight, setClippedRight] = React.useState(false);

  React.useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const update = () => setClippedRight(el.scrollWidth - el.clientWidth - el.scrollLeft > 1);
    update();
    el.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      observer.disconnect();
    };
  }, []);

  function toggleChip(chip: QuickChip) {
    if (chip.kind === "pets") {
      onApply({ ...filters, petsAllowed: filters.petsAllowed ? undefined : true });
      return;
    }
    const current = filters.amenities ?? [];
    const next = current.includes(chip.amenity)
      ? current.filter((a) => a !== chip.amenity)
      : [...current, chip.amenity];
    onApply({ ...filters, amenities: next.length ? next : undefined });
  }

  return (
    <div className="flex items-center gap-3">
      <Button
        variant="outline"
        size="sm"
        className="shrink-0 rounded-full"
        onClick={onOpenFilters}
        aria-haspopup="dialog"
      >
        <SlidersHorizontal />
        Filters
        {activeFilterCount > 0 ? (
          <span className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 font-mono text-[10px] font-semibold text-primary-foreground">
            {activeFilterCount}
          </span>
        ) : null}
      </Button>

      <div className="h-6 w-px shrink-0 bg-border" />

      <div className="relative min-w-0 flex-1">
        <div
          ref={scrollerRef}
          // py-1/-my-1 give the scroll container vertical headroom: chips are
          // 42.5px tall (fractional), and at non-integer zoom/DPI the
          // container can round down and shave the bottom border off.
          className="flex gap-2 overflow-x-auto py-1 -my-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {QUICK_CHIPS.map((chip) => {
            const active = isChipActive(chip, filters);
            return (
              <button
                key={chip.label}
                type="button"
                onClick={() => toggleChip(chip)}
                aria-pressed={active}
                className={cn(
                  "shrink-0 rounded-full border px-4 py-2 text-sm font-medium transition-[border-color,box-shadow] motion-safe:duration-[180ms] motion-safe:ease-out motion-reduce:transition-none",
                  active
                    ? "border-foreground ring-1 ring-inset ring-foreground"
                    : "border-border hover:border-foreground/50",
                )}
              >
                {chip.label}
              </button>
            );
          })}
        </div>
        {clippedRight ? (
          <div className="pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l from-background to-transparent" />
        ) : null}
      </div>
    </div>
  );
}
