"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronDown, Map as MapIcon, Search } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { PropertyCard } from "@/components/property/property-card";
import { SearchPill, type DetectedLocation, type SearchPillHandle } from "@/components/search/search-pill";
import { QuickFilters } from "@/components/search/quick-filters";
import { FiltersDialog } from "@/components/search/filters-dialog";
import { Button } from "@/components/ui/button";
import type { MapBounds } from "@/components/map/base-map";
import {
  propertyApi,
  type PropertyQuery,
  type PropertySort,
  type PropertyType,
} from "@/lib/api/properties";
import { queryKeys } from "@/lib/query/keys";

const BrowseMapPanel = dynamic(
  () => import("@/components/map/browse-map-panel").then((m) => m.BrowseMapPanel),
  { ssr: false, loading: () => <div className="size-full animate-pulse rounded-xl bg-muted" /> },
);

const PAGE_SIZE = 12;
/** Bbox query params are rounded to this many decimals (~1m precision). */
const BBOX_PRECISION = 5;

const SORTS: { value: PropertySort; label: string }[] = [
  { value: "newest", label: "Recommended" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseFilters(params: URLSearchParams): PropertyQuery {
  const amenities = params.get("amenities");
  return {
    city: params.get("city") ?? undefined,
    country: params.get("country") ?? undefined,
    district: params.get("district") ?? undefined,
    type: (params.get("type") as PropertyType | null) ?? undefined,
    minPrice: parseNumber(params.get("minPrice")),
    maxPrice: parseNumber(params.get("maxPrice")),
    maxGuests: parseNumber(params.get("maxGuests")),
    petsAllowed: params.get("petsAllowed") === "true" ? true : undefined,
    infantsAllowed: params.get("infantsAllowed") === "true" ? true : undefined,
    amenities: amenities ? amenities.split(",") : undefined,
    sort: (params.get("sort") as PropertySort | null) ?? "newest",
    checkIn: params.get("checkIn") ?? undefined,
    checkOut: params.get("checkOut") ?? undefined,
    minLat: parseNumber(params.get("minLat")),
    maxLat: parseNumber(params.get("maxLat")),
    minLng: parseNumber(params.get("minLng")),
    maxLng: parseNumber(params.get("maxLng")),
  };
}

/** Filters that define "a new search" — bbox is excluded since panning the
 *  map isn't a new search, it's a refinement of the current one. */
function nonBboxKey(filters: PropertyQuery): string {
  const { minLat: _minLat, maxLat: _maxLat, minLng: _minLng, maxLng: _maxLng, ...rest } = filters;
  return JSON.stringify(rest);
}

export function BrowseView({ detected }: { detected?: DetectedLocation }) {
  return (
    <React.Suspense
      fallback={
        <div className="flex flex-1 flex-col">
          <SiteHeader />
          <main className="mx-auto w-full max-w-[1180px] px-6 pt-6">
            <ResultsSkeleton />
          </main>
        </div>
      }
    >
      <BrowseResults detected={detected} />
    </React.Suspense>
  );
}

function BrowseResults({ detected }: { detected?: DetectedLocation }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchPillRef = React.useRef<SearchPillHandle>(null);
  const filters = React.useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [filtersOpen, setFiltersOpen] = React.useState(false);
  const [geoDismissed, setGeoDismissed] = React.useState(false);
  const [mapMode, setMapMode] = React.useState<"split" | "list">("split");
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [searchAsMove, setSearchAsMove] = React.useState(false);

  /** Bbox-only URL update — preserves every other param, no history spam. */
  function updateBounds(bounds: MapBounds) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("minLat", bounds.minLat.toFixed(BBOX_PRECISION));
    params.set("maxLat", bounds.maxLat.toFixed(BBOX_PRECISION));
    params.set("minLng", bounds.minLng.toFixed(BBOX_PRECISION));
    params.set("maxLng", bounds.maxLng.toFixed(BBOX_PRECISION));
    router.replace(`/browse?${params.toString()}`, { scroll: false });
  }

  React.useEffect(() => {
    setGeoDismissed(sessionStorage.getItem("geo-dismissed") === "1");
  }, []);

  const locationsQuery = useQuery({
    queryKey: queryKeys.properties.locations,
    queryFn: propertyApi.locations,
    staleTime: 5 * 60 * 1000,
  });

  const hasExplicitLocation = Boolean(filters.city || filters.country || filters.district);

  // Detection only ever supplies a rendering-time default — it must never
  // overwrite explicit URL params, and is never written back to the URL.
  const detectedMatch = React.useMemo(() => {
    if (hasExplicitLocation || geoDismissed || !detected?.city) return undefined;
    const target = detected.city.toLowerCase();
    // Same-named cities in different countries: the detected country wins,
    // city-only match is only a fallback when the country didn't resolve.
    let fallback: { city: string; country: string } | undefined;
    for (const country of locationsQuery.data ?? []) {
      for (const city of country.cities) {
        if (city.city.toLowerCase() !== target) continue;
        if (detected.country && country.country === detected.country) {
          return { city: city.city, country: country.country };
        }
        fallback ??= { city: city.city, country: country.country };
      }
    }
    return detected.country ? undefined : fallback;
  }, [hasExplicitLocation, geoDismissed, detected?.city, detected?.country, locationsQuery.data]);

  const effectiveFilters = detectedMatch
    ? { ...filters, city: detectedMatch.city, country: detectedMatch.country }
    : filters;

  const query = useInfiniteQuery({
    queryKey: queryKeys.properties.browse(effectiveFilters),
    queryFn: ({ pageParam }) =>
      propertyApi.search({ ...effectiveFilters, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const page = last.pagination.page ?? 1;
      const totalPages = last.pagination.totalPages ?? page;
      return page < totalPages ? page + 1 : undefined;
    },
  });

  const items = query.data?.pages.flatMap((p) => p.data) ?? [];
  const total = query.data?.pages[0]?.pagination.total ?? 0;
  const fitBoundsKey = React.useMemo(() => nonBboxKey(effectiveFilters), [effectiveFilters]);

  function applyFilters(next: PropertyQuery) {
    const params = new URLSearchParams();
    if (next.city) params.set("city", next.city);
    if (next.country) params.set("country", next.country);
    if (next.district) params.set("district", next.district);
    if (next.type) params.set("type", next.type);
    if (next.minPrice) params.set("minPrice", String(next.minPrice));
    if (next.maxPrice) params.set("maxPrice", String(next.maxPrice));
    if (next.maxGuests) params.set("maxGuests", String(next.maxGuests));
    if (next.petsAllowed) params.set("petsAllowed", "true");
    if (next.infantsAllowed) params.set("infantsAllowed", "true");
    if (next.amenities?.length) params.set("amenities", next.amenities.join(","));
    if (next.sort && next.sort !== "newest") params.set("sort", next.sort);
    if (next.checkIn && next.checkOut) {
      params.set("checkIn", next.checkIn);
      params.set("checkOut", next.checkOut);
    }
    const qs = params.toString();
    router.push(qs ? `/browse?${qs}` : "/browse");
  }

  const activeFilterCount =
    (filters.type ? 1 : 0) +
    (filters.minPrice || filters.maxPrice ? 1 : 0) +
    (filters.maxGuests ? 1 : 0) +
    (filters.petsAllowed ? 1 : 0) +
    (filters.infantsAllowed ? 1 : 0) +
    (filters.amenities?.length ?? 0) +
    (filters.country || filters.city || filters.district ? 1 : 0);

  const locationLabel = effectiveFilters.district
    ? `${effectiveFilters.district}, ${effectiveFilters.city}`
    : effectiveFilters.city;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main
        className={
          mapMode === "split"
            ? "mx-auto w-full max-w-[1600px] px-6 pt-6"
            : "mx-auto w-full max-w-[1180px] px-6 pt-6"
        }
      >
        <div className={mapMode === "split" ? "flex gap-8 lg:items-start" : undefined}>
        <div className={mapMode === "split" ? "min-w-0 flex-1 lg:max-w-[55%]" : "min-w-0 flex-1"}>
        <div className="mb-4">
          <SearchPill ref={searchPillRef} detected={detected} initialFilters={filters} collapsible />
        </div>

        <div className="mb-5">
          <QuickFilters
            filters={filters}
            activeFilterCount={activeFilterCount}
            onApply={applyFilters}
            onOpenFilters={() => setFiltersOpen(true)}
          />
        </div>

        {detectedMatch ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
            <span>
              Showing stays in {detectedMatch.city} — based on your location
            </span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => searchPillRef.current?.openWhere()}
                className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem("geo-dismissed", "1");
                  setGeoDismissed(true);
                }}
                className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Show all
              </button>
            </div>
          </div>
        ) : null}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-lg font-semibold tracking-tight">
            {query.isPending
              ? "Searching…"
              : `${total} ${total === 1 ? "stay" : "stays"}${
                  locationLabel ? ` in ${locationLabel}` : ""
                }`}
          </h1>
          <div className="flex items-center gap-3">
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono text-[11px] tracking-wide uppercase">Sort</span>
              <span className="relative inline-flex items-center">
                <select
                  value={filters.sort}
                  onChange={(e) =>
                    applyFilters({ ...filters, sort: e.target.value as PropertySort })
                  }
                  className="cursor-pointer appearance-none rounded-lg border border-border bg-background py-1.5 pr-7 pl-3 text-sm text-foreground outline-none"
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 size-[15px] text-muted-foreground" />
              </span>
            </label>
          </div>
        </div>

        <FiltersDialog
          open={filtersOpen}
          onOpenChange={setFiltersOpen}
          filters={filters}
          onApply={applyFilters}
        />

        {query.isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-destructive">{(query.error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Try again
            </Button>
          </div>
        ) : query.isPending ? (
          <ResultsSkeleton />
        ) : items.length === 0 ? (
          <EmptyState onClear={() => applyFilters({ sort: filters.sort })} />
        ) : (
          <>
            <section className="grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-6">
              {items.map((property) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  highlighted={hoveredId === property.id || selectedId === property.id}
                  onHoverChange={(hovering) => setHoveredId(hovering ? property.id : null)}
                />
              ))}
            </section>

            <div className="flex justify-center py-9">
              {query.hasNextPage ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                >
                  {query.isFetchingNextPage ? "Loading…" : "Show more stays"}
                </Button>
              ) : (
                <div className="flex flex-col items-center gap-1 text-center text-muted-foreground">
                  <div className="mb-2 h-px w-8 bg-border" />
                  <div className="text-sm font-medium text-foreground">
                    You&apos;ve reached the end
                  </div>
                  <div className="text-[13px]">Showing all {total} stays</div>
                </div>
              )}
            </div>
          </>
        )}
        </div>

        {mapMode === "split" ? (
          <div className="sticky top-22 hidden h-[calc(100vh-7rem)] flex-1 lg:block lg:max-w-[45%]">
            <BrowseMapPanel
              properties={items}
              hoveredId={hoveredId}
              onHoverChange={setHoveredId}
              selectedId={selectedId}
              onSelectChange={setSelectedId}
              searchAsMove={searchAsMove}
              onSearchAsMoveChange={setSearchAsMove}
              onBoundsChange={updateBounds}
              fitBoundsKey={fitBoundsKey}
            />
          </div>
        ) : null}
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-6 z-30 hidden justify-center lg:flex">
        <Button
          className="gap-1.5 rounded-full px-4 shadow-lg"
          onClick={() => setMapMode((m) => (m === "split" ? "list" : "split"))}
        >
          <MapIcon className="size-4" />
          {mapMode === "split" ? "Show list" : "Show map"}
        </Button>
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <section className="grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border">
          <div className="aspect-square animate-pulse bg-muted" />
          <div className="flex flex-col gap-2 px-4 pt-3 pb-4">
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-2/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </section>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border px-6 py-18 text-center">
      <div className="mb-4 flex size-13 items-center justify-center rounded-full border border-border text-muted-foreground">
        <Search className="size-5" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">No stays match your filters</h2>
      <p className="mt-1.5 max-w-[340px] text-sm text-muted-foreground text-pretty">
        Try widening your price range or removing a few amenities to see more places.
      </p>
      <Button variant="outline" size="sm" className="mt-5" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}
