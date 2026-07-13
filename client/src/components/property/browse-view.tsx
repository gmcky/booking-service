"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Map as MapIcon, Search, SlidersHorizontal } from "lucide-react";
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
import { useDeferredLoading } from "@/lib/hooks/use-deferred-loading";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useUiStore } from "@/lib/stores/ui-store";
import { paddedMarkerBounds } from "@/lib/utils/map-bounds";

const BrowseMapPanel = dynamic(
  () => import("@/components/map/browse-map-panel").then((m) => m.BrowseMapPanel),
  { ssr: false, loading: () => <div className="size-full animate-pulse rounded-xl bg-muted" /> },
);

const PAGE_SIZE = 12;
/** Bbox query params are rounded to this many decimals (~110m precision) —
 *  coarse on purpose, so near-identical viewports share one query key and
 *  hit the client cache instead of the network. */
const BBOX_PRECISION = 3;
/** Re-panning over a recently seen area is served from cache. */
const BROWSE_STALE_TIME_MS = 60 * 1000;

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

function hasBboxFilter(filters: PropertyQuery): boolean {
  return (
    filters.minLat !== undefined &&
    filters.maxLat !== undefined &&
    filters.minLng !== undefined &&
    filters.maxLng !== undefined
  );
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
  // Collapsed by default; a bbox in the URL means a map session is being
  // restored (reload, shared link) — hiding the map then would leave the
  // user filtered to an area they can't see or change.
  const [mapMode, setMapMode] = React.useState<"split" | "list">(() =>
    hasBboxFilter(filters) ? "split" : "list",
  );
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);

  const hasBbox = hasBboxFilter(filters);
  const isMobile = useMediaQuery("(max-width: 1023px)");
  const mapOpen = mapMode === "split";

  // Mobile map is a full-screen overlay — lock the page behind it so a stray
  // scroll can't reveal the listing grid underneath, and hide the bottom nav
  // (its global stacking context would otherwise paint over the overlay).
  const setMapOverlayOpen = useUiStore((s) => s.setMapOverlayOpen);
  React.useEffect(() => {
    const active = isMobile && mapOpen;
    setMapOverlayOpen(active);
    if (!active) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
      setMapOverlayOpen(false);
    };
  }, [isMobile, mapOpen, setMapOverlayOpen]);

  /** Bbox URL update — once the user moves the map, the viewport IS the
   *  location: named-location params are dropped (Airbnb's "map area"). */
  function updateBounds(bounds: MapBounds) {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("city");
    params.delete("country");
    params.delete("district");
    params.set("minLat", bounds.minLat.toFixed(BBOX_PRECISION));
    params.set("maxLat", bounds.maxLat.toFixed(BBOX_PRECISION));
    params.set("minLng", bounds.minLng.toFixed(BBOX_PRECISION));
    params.set("maxLng", bounds.maxLng.toFixed(BBOX_PRECISION));
    router.replace(`/browse?${params.toString()}`, { scroll: false });
  }

  /** Closing the map returns to the plain list search — the bbox belongs to
   *  the map, so it leaves with it. */
  function collapseMap() {
    setMapMode("list");
    if (!hasBbox) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("minLat");
    params.delete("maxLat");
    params.delete("minLng");
    params.delete("maxLng");
    const qs = params.toString();
    router.replace(qs ? `/browse?${qs}` : "/browse", { scroll: false });
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
  // Once the map has a bbox, the viewport is the location and detection
  // stays out of it entirely.
  const detectedMatch = React.useMemo(() => {
    if (hasExplicitLocation || hasBbox || geoDismissed || !detected?.city) return undefined;
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
  }, [hasExplicitLocation, hasBbox, geoDismissed, detected?.city, detected?.country, locationsQuery.data]);

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
    // Previous pages stay as placeholder; whether they remain visible or a
    // skeleton covers them is decided by the deferred gate below, so fast
    // refetches swap in place and only slow ones surface a skeleton.
    placeholderData: keepPreviousData,
    staleTime: BROWSE_STALE_TIME_MS,
  });

  // The map draws every match in the filter set, not the loaded list pages —
  // otherwise pins for unloaded pages simply don't exist. The bbox is padded
  // and grid-snapped (paddedMarkerBounds) so small pans reuse the cached
  // marker set — only the list refetches.
  const markerFilters = React.useMemo(() => {
    const { sort: _sort, page: _page, limit: _limit, ...rest } = effectiveFilters;
    if (
      rest.minLat === undefined ||
      rest.maxLat === undefined ||
      rest.minLng === undefined ||
      rest.maxLng === undefined
    ) {
      return rest;
    }
    const padded = paddedMarkerBounds({
      minLat: rest.minLat,
      maxLat: rest.maxLat,
      minLng: rest.minLng,
      maxLng: rest.maxLng,
    });
    return { ...rest, ...padded };
  }, [effectiveFilters]);
  const markersQuery = useQuery({
    queryKey: queryKeys.properties.mapMarkers(markerFilters),
    queryFn: () => propertyApi.mapMarkers(markerFilters),
    enabled: mapMode === "split",
    // Pins must not vanish mid-pan while the next viewport's set loads.
    placeholderData: keepPreviousData,
    staleTime: BROWSE_STALE_TIME_MS,
  });

  const items = query.data?.pages.flatMap((p) => p.data) ?? [];
  const total = query.data?.pages[0]?.pagination.total ?? 0;
  // Skeleton only when there's nothing to render yet (first load). Any
  // refetch that has placeholder cards keeps them fully visible — the
  // loading cue lives in a spinner decoupled from the content, so a pan
  // that resolves to the same stays never touches the grid at all.
  const showSkeleton = query.isPending;
  // Deferred so instant cache hits never flash the spinner.
  const searching = useDeferredLoading(
    query.isPlaceholderData || markersQuery.isFetching,
    150,
    300,
  );
  /** Empty while a bbox drives the search — the camera must never re-fit
   *  in response to its own pan. */
  const fitBoundsKey = React.useMemo(
    () => (hasBbox ? "" : nonBboxKey(effectiveFilters)),
    [hasBbox, effectiveFilters],
  );
  const initialMapBounds = React.useMemo<[[number, number], [number, number]] | undefined>(
    () =>
      hasBbox
        ? [
            [filters.minLng!, filters.minLat!],
            [filters.maxLng!, filters.maxLat!],
          ]
        : undefined,
    // Mount-only camera restore; live values reach the map via user gestures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

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
    : (effectiveFilters.city ?? (hasBbox ? "map area" : undefined));

  const fmtDay = (iso: string) =>
    new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  const mapSummary =
    [
      filters.checkIn && filters.checkOut
        ? `${fmtDay(filters.checkIn)} – ${fmtDay(filters.checkOut)}`
        : null,
      filters.maxGuests ? `${filters.maxGuests} guest${filters.maxGuests > 1 ? "s" : ""}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "Any week · Add guests";

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main
        className={
          mapMode === "split"
            ? "mx-auto w-full max-w-[1600px] px-6 pt-6 lg:pb-24"
            : "mx-auto w-full max-w-[1180px] px-6 pt-6 lg:pb-24"
        }
      >
        <div className={mapMode === "split" ? "flex gap-8 lg:items-start" : undefined}>
        <motion.div
          layout
          transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
          className={mapMode === "split" ? "min-w-0 flex-1 lg:max-w-[55%]" : "min-w-0 flex-1"}
        >
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

        {/* In split view the map itself communicates the detected location
            (camera fits it) — the banner is list-only UI. */}
        {detectedMatch && mapMode === "list" ? (
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
            {/* In list mode there's no map spinner, and every refetch there is
                a real new search (bbox pans only exist in split view) — the
                heading is the loading cue. */}
            {showSkeleton || (searching && mapMode === "list")
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

        {/* Full error state only when there's nothing to show — a failed
            background refetch (e.g. transient 429 mid-pan) keeps the stale
            grid on screen instead of blanking the page into a retry loop. */}
        {query.isError && items.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-destructive">{(query.error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Try again
            </Button>
          </div>
        ) : showSkeleton ? (
          <ResultsSkeleton />
        ) : items.length === 0 ? (
          <EmptyState onClear={() => applyFilters({ sort: filters.sort })} />
        ) : (
          <>
            {/* No enter animation on purpose: cards are keyed by id, so React
                swaps only the ones that actually changed and a map pan never
                flashes the grid. The map spinner is the only loading cue. */}
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
        </motion.div>

        {/* Desktop: sticky side panel that slides in from the right (slide on
            the inner wrapper — a transform on the sticky outer would break its
            positioning). Mobile: an edge-to-edge full-screen overlay that just
            fades in. */}
        <AnimatePresence>
          {mapMode === "split" ? (
            <motion.div
              key="browse-map"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="fixed inset-0 z-40 overflow-hidden bg-background lg:inset-auto lg:z-auto lg:bg-transparent lg:sticky lg:top-22 lg:h-[calc(100vh-7rem)] lg:max-w-[45%] lg:flex-1"
            >
              <motion.div
                className="size-full"
                initial={isMobile ? false : { x: "100%" }}
                animate={isMobile ? { x: 0 } : { x: 0 }}
                exit={isMobile ? { x: 0 } : { x: "100%" }}
                transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
              >
                <BrowseMapPanel
                  markers={markersQuery.data ?? []}
                  markersPending={markersQuery.isPending || markersQuery.isPlaceholderData}
                  searching={searching}
                  hoveredId={hoveredId}
                  onHoverChange={setHoveredId}
                  selectedId={selectedId}
                  onSelectChange={setSelectedId}
                  onBoundsChange={updateBounds}
                  onCollapse={collapseMap}
                  initialBounds={initialMapBounds}
                  fitBoundsKey={fitBoundsKey}
                />
              </motion.div>

              {/* Mobile map chrome: back + search summary + filters, over the map. */}
              <div className="absolute inset-x-0 top-0 z-20 bg-gradient-to-b from-background via-background/90 to-transparent px-3 pt-3 pb-6 lg:hidden">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    aria-label="Back to list"
                    onClick={collapseMap}
                    className="flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-sm"
                  >
                    <ArrowLeft className="size-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => searchPillRef.current?.openWhere()}
                    className="min-w-0 flex-1 rounded-full border border-border bg-card px-4 py-1.5 text-center shadow-sm"
                  >
                    <div className="truncate text-sm font-semibold">
                      {locationLabel ? `Homes in ${locationLabel}` : "Homes in map area"}
                    </div>
                    <div className="truncate text-[11px] text-muted-foreground">{mapSummary}</div>
                  </button>
                  <button
                    type="button"
                    aria-label="Filters"
                    onClick={() => setFiltersOpen(true)}
                    className="relative flex size-10 shrink-0 items-center justify-center rounded-full border border-border bg-card shadow-sm"
                  >
                    <SlidersHorizontal className="size-4" />
                    {activeFilterCount > 0 ? (
                      <span className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                        {activeFilterCount}
                      </span>
                    ) : null}
                  </button>
                </div>
              </div>

              {/* Bottom result count — hidden while a listing card is open. */}
              {selectedId ? null : (
                <div className="pointer-events-none absolute inset-x-0 bottom-5 z-10 flex justify-center lg:hidden">
                  <div className="rounded-full bg-foreground px-4 py-2 text-sm font-medium text-background shadow-lg">
                    {showSkeleton || searching ? "Searching…" : `${total} ${total === 1 ? "home" : "homes"}`}
                  </div>
                </div>
              )}
            </motion.div>
          ) : null}
        </AnimatePresence>
        </div>
      </main>

      {/* Toggle. On mobile the open map has its own back arrow, so this hides
          while the overlay is up; on desktop it stays as the Show list/map switch. */}
      <div
        className={`fixed inset-x-0 bottom-6 z-50 justify-center ${
          mapOpen && isMobile ? "hidden" : "flex"
        }`}
      >
        <Button
          className="gap-1.5 rounded-full px-4 shadow-lg"
          onClick={() => (mapMode === "split" ? collapseMap() : setMapMode("split"))}
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
