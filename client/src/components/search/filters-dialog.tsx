"use client";

import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Baby,
  Building2,
  Dog,
  Home,
  Hotel,
  Minus,
  Plus,
  Presentation,
  XIcon,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { amenityIcon } from "@/lib/api/amenity-icons";
import { AMENITY_LABELS } from "@/lib/api/labels";
import {
  propertyApi,
  type Amenity,
  type PropertyQuery,
  type PropertyType,
} from "@/lib/api/properties";
import { queryKeys } from "@/lib/query/keys";
import { parseDecimal } from "@/lib/utils/money";
import { cn } from "@/lib/utils";

const BUCKET_COUNT = 24;
const VISIBLE_AMENITIES = 8;
const MAX_GUESTS = 16;
const ALL_AMENITIES = Object.keys(AMENITY_LABELS) as Amenity[];

const TYPE_OPTIONS: { value?: PropertyType; label: string; icon?: LucideIcon }[] = [
  { label: "Any" },
  { value: "HOUSE", label: "House", icon: Home },
  { value: "APARTMENT", label: "Apartment", icon: Building2 },
  { value: "HOTEL_ROOM", label: "Hotel room", icon: Hotel },
  { value: "MEETING_ROOM", label: "Meeting room", icon: Presentation },
];

const CHIP_CLASS =
  "inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-[border-color,box-shadow] motion-safe:duration-[180ms] motion-safe:ease-out motion-reduce:transition-none";
const CHIP_ACTIVE = "border-foreground ring-1 ring-foreground";
const CHIP_INACTIVE = "border-border hover:border-foreground/50";

/**
 * Two overlaid native range inputs sharing one track. Only the thumb (a
 * pseudo-element) is interactive — the input body is pointer-events-none so
 * clicks land on whichever thumb they're nearest, same as a native browser
 * dual-range control.
 */
const RANGE_INPUT_CLASS = cn(
  "pointer-events-none absolute inset-0 h-4 w-full appearance-none bg-transparent",
  "[&::-webkit-slider-runnable-track]:appearance-none [&::-webkit-slider-runnable-track]:bg-transparent",
  "[&::-moz-range-track]:appearance-none [&::-moz-range-track]:bg-transparent",
  "[&::-webkit-slider-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:[-webkit-appearance:none] [&::-webkit-slider-thumb]:size-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border [&::-webkit-slider-thumb]:border-foreground [&::-webkit-slider-thumb]:bg-background [&::-webkit-slider-thumb]:shadow",
  "[&::-moz-range-thumb]:pointer-events-auto [&::-moz-range-thumb]:size-4 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border [&::-moz-range-thumb]:border-foreground [&::-moz-range-thumb]:bg-background [&::-moz-range-thumb]:shadow",
);

interface DraftFilters {
  type?: PropertyType;
  minPrice?: number;
  maxPrice?: number;
  maxGuests: number;
  amenities: Amenity[];
  petsAllowed: boolean;
  infantsAllowed: boolean;
}

function draftFromFilters(filters: PropertyQuery): DraftFilters {
  return {
    type: filters.type,
    minPrice: filters.minPrice,
    maxPrice: filters.maxPrice,
    maxGuests: filters.maxGuests ?? 0,
    amenities: (filters.amenities as Amenity[] | undefined) ?? [],
    petsAllowed: Boolean(filters.petsAllowed),
    infantsAllowed: Boolean(filters.infantsAllowed),
  };
}

/** Applies the draft on top of the current URL filters so location, dates
 * and sort (which this dialog doesn't own) survive unchanged. */
function buildQuery(filters: PropertyQuery, draft: DraftFilters): PropertyQuery {
  return {
    ...filters,
    type: draft.type,
    minPrice: draft.minPrice,
    maxPrice: draft.maxPrice,
    maxGuests: draft.maxGuests || undefined,
    petsAllowed: draft.petsAllowed || undefined,
    infantsAllowed: draft.infantsAllowed || undefined,
    amenities: draft.amenities.length ? draft.amenities : undefined,
  };
}

export interface FiltersDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filters: PropertyQuery;
  onApply: (next: PropertyQuery) => void;
}

export function FiltersDialog({ open, onOpenChange, filters, onApply }: FiltersDialogProps) {
  const [draft, setDraft] = React.useState<DraftFilters>(() => draftFromFilters(filters));
  const [showAllAmenities, setShowAllAmenities] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDraft(draftFromFilters(filters));
    setShowAllAmenities(false);
    // Intentionally re-initializes only on the open transition — re-running
    // on every `filters`/`draft` change would fight the user's edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const locationQuery = {
    city: filters.city,
    country: filters.country,
    district: filters.district,
    checkIn: filters.checkIn,
    checkOut: filters.checkOut,
  };

  const histogramQuery = useQuery({
    queryKey: queryKeys.properties.list({ ...locationQuery, limit: 100 }),
    queryFn: () => propertyApi.search({ ...locationQuery, limit: 100 }),
    enabled: open,
    staleTime: 60_000,
  });

  const { buckets, boundsMin, boundsMax } = React.useMemo(() => {
    const prices = histogramQuery.data?.data.map((p) => parseDecimal(p.pricePerNight)) ?? [];
    if (prices.length === 0) {
      return { buckets: Array<number>(BUCKET_COUNT).fill(0), boundsMin: 0, boundsMax: 1000 };
    }
    const min = Math.floor(Math.min(...prices));
    const max = Math.ceil(Math.max(...prices));
    const span = Math.max(max - min, 1);
    const nextBuckets = Array<number>(BUCKET_COUNT).fill(0);
    for (const price of prices) {
      const idx = Math.min(BUCKET_COUNT - 1, Math.floor(((price - min) / span) * BUCKET_COUNT));
      nextBuckets[idx] += 1;
    }
    return { buckets: nextBuckets, boundsMin: min, boundsMax: max };
  }, [histogramQuery.data]);

  const maxBucket = Math.max(1, ...buckets);
  const priceSpan = Math.max(1, boundsMax - boundsMin);
  const effMin = draft.minPrice ?? boundsMin;
  const effMax = draft.maxPrice ?? boundsMax;

  const [debouncedDraft, setDebouncedDraft] = React.useState(draft);
  React.useEffect(() => {
    const timer = setTimeout(() => setDebouncedDraft(draft), 300);
    return () => clearTimeout(timer);
  }, [draft]);

  const countQuery = useQuery({
    queryKey: queryKeys.properties.list({ ...buildQuery(filters, debouncedDraft), limit: 1 }),
    queryFn: () => propertyApi.search({ ...buildQuery(filters, debouncedDraft), limit: 1 }),
    enabled: open,
    placeholderData: keepPreviousData,
    select: (data) => data.pagination.total,
  });

  function clampMin(value: number) {
    return Math.min(Math.max(value, boundsMin), effMax - 1);
  }
  function clampMax(value: number) {
    return Math.max(Math.min(value, boundsMax), effMin + 1);
  }

  function toggleAmenity(amenity: Amenity) {
    setDraft((d) => ({
      ...d,
      amenities: d.amenities.includes(amenity)
        ? d.amenities.filter((a) => a !== amenity)
        : [...d.amenities, amenity],
    }));
  }

  function handleClearAll() {
    onApply({ sort: filters.sort });
    onOpenChange(false);
  }

  function handleShow() {
    onApply(buildQuery(filters, draft));
    onOpenChange(false);
  }

  const visibleAmenities = showAllAmenities
    ? ALL_AMENITIES
    : ALL_AMENITIES.slice(0, VISIBLE_AMENITIES);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="flex max-h-[85vh] w-full flex-col gap-0 p-0 sm:max-w-[560px]"
      >
        <div className="relative flex shrink-0 items-center justify-center border-b border-border px-6 py-4">
          <DialogTitle className="text-base font-semibold">Filters</DialogTitle>
          <DialogDescription className="sr-only">
            Filter search results by type, price, guests, amenities and house rules.
          </DialogDescription>
          <Button
            variant="ghost"
            size="icon-sm"
            className="absolute right-3"
            onClick={() => onOpenChange(false)}
            aria-label="Close"
          >
            <XIcon />
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto px-6">
          <section className="border-b border-border py-6">
            <h3 className="mb-3 text-[15px] font-semibold">Type of place</h3>
            <div className="flex flex-wrap gap-2">
              {TYPE_OPTIONS.map((opt) => {
                const active = draft.type === opt.value;
                const Icon = opt.icon;
                return (
                  <button
                    key={opt.label}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setDraft((d) => ({ ...d, type: opt.value }))}
                    className={cn(CHIP_CLASS, active ? CHIP_ACTIVE : CHIP_INACTIVE)}
                  >
                    {Icon ? <Icon className="size-4" /> : null}
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="border-b border-border py-6">
            <h3 className="text-[15px] font-semibold">Price range</h3>
            <p className="mb-4 text-sm text-muted-foreground">Per night</p>

            <div className="flex h-16 items-end gap-[2px]" aria-hidden>
              {buckets.map((count, i) => {
                const bucketStart = boundsMin + (i / BUCKET_COUNT) * priceSpan;
                const bucketEnd = boundsMin + ((i + 1) / BUCKET_COUNT) * priceSpan;
                const inRange = bucketEnd >= effMin && bucketStart <= effMax;
                return (
                  <div
                    key={i}
                    className={cn(
                      "flex-1 rounded-[1px] bg-primary transition-opacity duration-150",
                      inRange ? "opacity-100" : "opacity-30",
                    )}
                    style={{ height: `${Math.max(4, (count / maxBucket) * 100)}%` }}
                  />
                );
              })}
            </div>

            <div className="relative mt-6 h-4">
              <div className="absolute top-1/2 h-1 w-full -translate-y-1/2 rounded-full bg-muted" />
              <div
                className="absolute top-1/2 h-1 -translate-y-1/2 rounded-full bg-foreground"
                style={{
                  left: `${((effMin - boundsMin) / priceSpan) * 100}%`,
                  right: `${100 - ((effMax - boundsMin) / priceSpan) * 100}%`,
                }}
              />
              <input
                type="range"
                aria-label="Minimum price"
                min={boundsMin}
                max={boundsMax}
                value={effMin}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, minPrice: clampMin(Number(e.target.value)) }))
                }
                className={RANGE_INPUT_CLASS}
              />
              <input
                type="range"
                aria-label="Maximum price"
                min={boundsMin}
                max={boundsMax}
                value={effMax}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, maxPrice: clampMax(Number(e.target.value)) }))
                }
                className={RANGE_INPUT_CLASS}
              />
            </div>

            <div className="mt-5 flex items-center gap-3">
              <label className="flex-1">
                <span className="mb-1 block text-xs text-muted-foreground">Minimum</span>
                <div className="flex items-center rounded-lg border border-border px-3 py-1">
                  <span className="mr-1 text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    aria-label="Minimum price"
                    min={boundsMin}
                    max={effMax - 1}
                    value={effMin}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        minPrice: clampMin(Number(e.target.value) || boundsMin),
                      }))
                    }
                    className="h-auto border-0 p-0 focus-visible:ring-0"
                  />
                </div>
              </label>
              <label className="flex-1">
                <span className="mb-1 block text-xs text-muted-foreground">Maximum</span>
                <div className="flex items-center rounded-lg border border-border px-3 py-1">
                  <span className="mr-1 text-sm text-muted-foreground">$</span>
                  <Input
                    type="number"
                    aria-label="Maximum price"
                    min={effMin + 1}
                    max={boundsMax}
                    value={effMax}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        maxPrice: clampMax(Number(e.target.value) || boundsMax),
                      }))
                    }
                    className="h-auto border-0 p-0 focus-visible:ring-0"
                  />
                </div>
              </label>
            </div>
            {(histogramQuery.data?.pagination.total ?? 0) > 100 ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Based on the first 100 matching stays.
              </p>
            ) : null}
          </section>

          <section className="flex items-center justify-between border-b border-border py-6">
            <span className="text-[15px] font-semibold">Guests</span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                aria-label="Decrease guests"
                disabled={draft.maxGuests <= 0}
                onClick={() => setDraft((d) => ({ ...d, maxGuests: Math.max(0, d.maxGuests - 1) }))}
                className="flex size-8 items-center justify-center rounded-full border border-border disabled:opacity-40"
              >
                <Minus className="size-3.5" />
              </button>
              <span className="w-14 text-center text-sm">
                {draft.maxGuests === 0 ? "Any" : draft.maxGuests}
              </span>
              <button
                type="button"
                aria-label="Increase guests"
                disabled={draft.maxGuests >= MAX_GUESTS}
                onClick={() =>
                  setDraft((d) => ({ ...d, maxGuests: Math.min(MAX_GUESTS, d.maxGuests + 1) }))
                }
                className="flex size-8 items-center justify-center rounded-full border border-border disabled:opacity-40"
              >
                <Plus className="size-3.5" />
              </button>
            </div>
          </section>

          <section className="border-b border-border py-6">
            <h3 className="mb-3 text-[15px] font-semibold">Amenities</h3>
            <div className="flex flex-wrap gap-2">
              {visibleAmenities.map((amenity) => {
                const Icon = amenityIcon(amenity);
                const active = draft.amenities.includes(amenity);
                return (
                  <button
                    key={amenity}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleAmenity(amenity)}
                    className={cn(CHIP_CLASS, active ? CHIP_ACTIVE : CHIP_INACTIVE)}
                  >
                    <Icon className="size-4" />
                    {AMENITY_LABELS[amenity]}
                  </button>
                );
              })}
            </div>
            <button
              type="button"
              onClick={() => setShowAllAmenities((v) => !v)}
              className="mt-3 text-sm text-foreground underline underline-offset-2"
            >
              {showAllAmenities ? "Show less ⌃" : "Show more ⌄"}
            </button>
          </section>

          <section className="py-6">
            <h3 className="mb-3 text-[15px] font-semibold">House rules</h3>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                aria-pressed={draft.petsAllowed}
                onClick={() => setDraft((d) => ({ ...d, petsAllowed: !d.petsAllowed }))}
                className={cn(CHIP_CLASS, draft.petsAllowed ? CHIP_ACTIVE : CHIP_INACTIVE)}
              >
                <Dog className="size-4" />
                Allows pets
              </button>
              <button
                type="button"
                aria-pressed={draft.infantsAllowed}
                onClick={() => setDraft((d) => ({ ...d, infantsAllowed: !d.infantsAllowed }))}
                className={cn(CHIP_CLASS, draft.infantsAllowed ? CHIP_ACTIVE : CHIP_INACTIVE)}
              >
                <Baby className="size-4" />
                Suitable for infants
              </button>
            </div>
          </section>
        </div>

        <div className="flex shrink-0 items-center justify-between border-t border-border px-6 py-4">
          <button
            type="button"
            onClick={handleClearAll}
            className="text-sm text-foreground underline underline-offset-2"
          >
            Clear all
          </button>
          <Button className="bg-foreground text-background hover:bg-foreground/90" onClick={handleShow}>
            {countQuery.isPending ? "Show places" : `Show ${countQuery.data ?? 0} places`}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
