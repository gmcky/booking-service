"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import Image from "next/image";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { keepPreviousData, useInfiniteQuery, useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ChevronDown,
  Loader2,
  Map as MapIcon,
  Search,
  SlidersHorizontal,
  Star,
  X,
} from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { PropertyCard } from "@/components/property/property-card";
import { FavoriteButton } from "@/components/property/favorite-button";
import { SearchPill, type SearchPillHandle } from "@/components/search/search-pill";
import { QuickFilters } from "@/components/search/quick-filters";
import { FiltersDialog } from "@/components/search/filters-dialog";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import type { MapBounds } from "@/components/map/base-map";
import { MapListSheet, type SheetSnap } from "@/components/map/map-list-sheet";
import {
  propertyApi,
  type PropertyMapMarker,
  type PropertyQuery,
  type PropertySort,
  type PropertyType,
} from "@/lib/api/properties";
import { queryKeys } from "@/lib/query/keys";
import { useDeferredLoading } from "@/lib/hooks/use-deferred-loading";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useOverlayHistory } from "@/lib/hooks/use-overlay-history";
import { useUiStore } from "@/lib/stores/ui-store";
import { lockBodyScroll } from "@/lib/utils/scroll-lock";
import { paddedMarkerBounds } from "@/lib/utils/map-bounds";
import { formatPrice, formatRating } from "@/lib/utils/money";
import { PHOTO_STRIPES, photoUrl } from "@/lib/utils/photo";

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

type NamedLocation = { city?: string; country?: string; district?: string };

function namedOf(filters: PropertyQuery): NamedLocation {
  return { city: filters.city, country: filters.country, district: filters.district };
}

function sameNamed(a: NamedLocation | undefined, b: NamedLocation | undefined): boolean {
  return a?.city === b?.city && a?.country === b?.country && a?.district === b?.district;
}

/** Search identity of a map session: bbox AND named location stripped, because
 *  panning replaces the one with the other. The named location is remembered
 *  separately (see lastCameraRef) rather than folded into the key. */
function mapSessionKey(filters: PropertyQuery): string {
  return nonBboxKey({ ...filters, city: undefined, country: undefined, district: undefined });
}

function hasBboxFilter(filters: PropertyQuery): boolean {
  return (
    filters.minLat !== undefined &&
    filters.maxLat !== undefined &&
    filters.minLng !== undefined &&
    filters.maxLng !== undefined
  );
}

export function BrowseView() {
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
      <BrowseResults />
    </React.Suspense>
  );
}

function BrowseResults() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchPillRef = React.useRef<SearchPillHandle>(null);
  const filters = React.useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [filtersOpen, setFiltersOpen] = React.useState(false);
  // Collapsed by default; a bbox in the URL means a map session is being
  // restored (reload, shared link) — hiding the map then would leave the
  // user filtered to an area they can't see or change.
  const [mapMode, setMapMode] = React.useState<"split" | "list">(() =>
    hasBboxFilter(filters) ? "split" : "list",
  );
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [sheetSnap, setSheetSnap] = React.useState<SheetSnap>("peek");

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
    const release = lockBodyScroll();
    return () => {
      release();
      setMapOverlayOpen(false);
    };
  }, [isMobile, mapOpen, setMapOverlayOpen]);

  /**
   * The map rewrites its own search params in place.
   *
   * Not `router.replace`: this route is statically prerendered, and in a
   * production build the router drops a navigation whose only difference is
   * the query string — silently, so the map kept moving while the URL, and
   * therefore the list, stayed behind. The history API is what Next documents
   * for search-param updates, and it feeds `useSearchParams` the same way.
   */
  function replaceSearch(params: URLSearchParams) {
    const qs = params.toString();
    window.history.replaceState(null, "", qs ? `/browse?${qs}` : "/browse");
  }

  /**
   * A submitted search owns the viewport, so the remembered camera goes with
   * it — otherwise searching a new city and opening the map would land on the
   * area left over from the last one.
   *
   * Called from the two places a new search actually starts (this page's
   * filters and the search pill), not from watching the URL: closing the map
   * with the system Back pops the overlay's history entry, which rewinds the
   * query string to the pre-map search. A URL watcher reads that as somebody
   * else's navigation and throws away the very camera the visitor just spent
   * the map session choosing.
   */
  function forgetCamera() {
    lastCameraRef.current = undefined;
  }

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
    // Tagged with the named search this area was laid over, not with the params
    // the pan leaves behind: closing the map hands that name back, so a reopen
    // has to recognise its own session under it.
    lastCameraRef.current = {
      key: mapSessionKey(filters),
      named: supersededLocationRef.current ?? namedOf(filters),
      bounds: [
        [bounds.minLng, bounds.minLat],
        [bounds.maxLng, bounds.maxLat],
      ],
    };
    replaceSearch(params);
  }

  /** The named search the map's area was laid over. Panning replaces it with a
   *  bbox, so closing the map has to hand it back — otherwise a visitor who
   *  searched Kyiv, glanced at the map and closed it lands on every listing
   *  worldwide with nothing on screen explaining why. Cleared once the visitor
   *  is genuinely searching nowhere in particular. */
  const supersededLocationRef = React.useRef<
    { city?: string; country?: string; district?: string } | undefined
  >(undefined);
  React.useEffect(() => {
    if (filters.city || filters.country || filters.district) {
      supersededLocationRef.current = {
        city: filters.city,
        country: filters.country,
        district: filters.district,
      };
    } else if (!hasBbox) {
      supersededLocationRef.current = undefined;
    }
  }, [filters.city, filters.country, filters.district, hasBbox]);

  /** Closing the map takes its area with it and restores the named search. */
  function collapseMap() {
    setMapMode("list");
    const named = supersededLocationRef.current;
    if (!hasBbox) return;
    const params = new URLSearchParams(searchParams.toString());
    params.delete("minLat");
    params.delete("maxLat");
    params.delete("minLng");
    params.delete("maxLng");
    if (named?.city) params.set("city", named.city);
    if (named?.country) params.set("country", named.country);
    if (named?.district) params.set("district", named.district);
    replaceSearch(params);
  }

  // Full-screen on mobile, so Back belongs to the map, not to the page under it.
  // The release handle matters here: the sheet's cards navigate away while the
  // overlay is still mounted, and without it the unmount would pop the entry
  // the overlay owns and undo the navigation that just happened.
  const releaseOverlayHistory = useOverlayHistory(isMobile && mapOpen, collapseMap);

  // The sheet starts closed on every map session, and a pin tap opens it far
  // enough to read the card it scrolls to. Reset on the breakpoint too: the
  // sheet mounts when a resize crosses into mobile with the map already open,
  // and it must not come up at whatever snap an earlier session left behind.
  React.useEffect(() => {
    setSheetSnap("peek");
  }, [mapOpen, isMobile]);

  function handleSelectChange(id: string | null) {
    setSelectedId(id);
    if (id && isMobile) setSheetSnap((snap) => (snap === "peek" ? "half" : snap));
  }

  // Browse deliberately does NOT default to the visitor's own city: someone
  // planning a trip would have to undo it on every visit. The geo demo lives
  // on home ("Stays near you") and behind the search pill's Nearby shortcut.
  const query = useInfiniteQuery({
    queryKey: queryKeys.properties.browse(filters),
    queryFn: ({ pageParam }) =>
      propertyApi.search({ ...filters, page: pageParam, limit: PAGE_SIZE }),
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

  // The map panel is a lazy chunk (maplibre is heavy). Warming it once the
  // page is idle means opening the map shows a map, not the pulse placeholder.
  React.useEffect(() => {
    const id = setTimeout(() => void import("@/components/map/browse-map-panel"), 1500);
    return () => clearTimeout(id);
  }, []);

  // Pages load as the sentinel below the grid comes into view. Re-observing
  // after each page is what chains them: if the sentinel is still on screen
  // once the new cards are in, the next page starts immediately.
  const loadMoreRef = React.useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = query;
  // The mobile map is a full-screen overlay over a still-mounted list: without
  // this gate a sentinel left on screen underneath keeps paging a list nobody
  // is looking at.
  const listVisible = !(isMobile && mapOpen);
  React.useEffect(() => {
    const el = loadMoreRef.current;
    if (!el || !hasNextPage || isFetchingNextPage || !listVisible) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) fetchNextPage();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, listVisible]);

  // Same chain inside the sheet, observed against the sheet's own scroller —
  // the page behind the map is scroll-locked, so a viewport-rooted sentinel
  // would never come into view and the list would stop at page one.
  const sheetScrollRef = React.useRef<HTMLDivElement>(null);
  const sheetLoadMoreRef = React.useRef<HTMLDivElement>(null);
  const sheetVisible = isMobile && mapOpen;
  React.useEffect(() => {
    const el = sheetLoadMoreRef.current;
    const root = sheetScrollRef.current;
    if (!el || !root || !hasNextPage || isFetchingNextPage || !sheetVisible) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) fetchNextPage();
      },
      { root, rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, sheetVisible]);

  // The map draws every match in the filter set, not the loaded list pages —
  // otherwise pins for unloaded pages simply don't exist. The bbox is padded
  // and grid-snapped (paddedMarkerBounds) so small pans reuse the cached
  // marker set — only the list refetches.
  const markerFilters = React.useMemo(() => {
    const { sort: _sort, page: _page, limit: _limit, ...rest } = filters;
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
  }, [filters]);
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
  /**
   * A tapped pin always becomes the sheet's first card, whether or not the
   * list has paged that far — the map draws every match, the list holds only
   * what's loaded, so hunting for the card in place could land on nothing.
   */
  const selectedItem = selectedId
    ? (items.find((item) => item.id === selectedId) ?? null)
    : null;
  /** Markers carry no city or description, and the selected card is the most
   *  prominent thing in the sheet — it shouldn't be a thinner version of the
   *  cards below it just because its page hasn't loaded. One cached request. */
  const selectedDetail = useQuery({
    queryKey: queryKeys.properties.detail(selectedId ?? ""),
    queryFn: () => propertyApi.byId(selectedId!),
    enabled: Boolean(selectedId) && !selectedItem && isMobile && mapOpen,
    staleTime: BROWSE_STALE_TIME_MS,
  });
  const selectedListing: PinnedListing | null = selectedId
    ? (selectedItem ??
      selectedDetail.data ??
      (markersQuery.data ?? []).find((marker) => marker.id === selectedId) ??
      null)
    : null;
  /** Shown below the selected card, so the selection isn't on screen twice. */
  const sheetItems = selectedId ? items.filter((item) => item.id !== selectedId) : items;
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
    () => (hasBbox ? "" : nonBboxKey(filters)),
    [hasBbox, filters],
  );
  /** Where the user last left the camera, tagged with the search it belonged
   *  to. Closing the map drops the bbox from the URL, so without this a reopen
   *  remounts the panel with nothing to restore and refits to every marker in
   *  the set — the whole world for an unfiltered search. The tag is what keeps
   *  a stale camera from hijacking a genuinely new search. */
  const lastCameraRef = React.useRef<
    | {
        key: string;
        named: NamedLocation | undefined;
        bounds: [[number, number], [number, number]];
      }
    | undefined
  >(
    hasBboxFilter(filters)
      ? {
          key: mapSessionKey(filters),
          named: namedOf(filters),
          bounds: [
            [filters.minLng!, filters.minLat!],
            [filters.maxLng!, filters.maxLat!],
          ],
        }
      : undefined,
  );
  // A named search owns the camera only until the visitor moves the map over
  // it. After that the area they picked IS their answer to that search, and
  // closing the map (which hands the name back so the list isn't worldwide)
  // must not throw it away — reopening returns to where they left off, not to
  // the city they typed three pans ago. A camera tagged with a different name,
  // or dropped by a genuinely new search, never applies.
  const cameraMemory = lastCameraRef.current;
  const restoredCamera =
    cameraMemory &&
    cameraMemory.key === mapSessionKey(filters) &&
    sameNamed(cameraMemory.named, namedOf(filters))
      ? cameraMemory.bounds
      : undefined;

  // Restoring the viewport also has to restore the search it framed. Without
  // this the map reopens on the area the visitor left, while the list beside
  // it still answers "everywhere" — the two disagree on screen.
  React.useEffect(() => {
    if (mapMode !== "split" || hasBbox || !restoredCamera) return;
    updateBounds({
      minLng: restoredCamera[0][0],
      minLat: restoredCamera[0][1],
      maxLng: restoredCamera[1][0],
      maxLat: restoredCamera[1][1],
    });
    // Only when the map opens; later bounds arrive from the map's own moves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapMode]);

  function applyFilters(next: PropertyQuery) {
    forgetCamera();
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

  const locationLabel = filters.district
    ? `${filters.district}, ${filters.city}`
    : (filters.city ?? (hasBbox ? "map area" : undefined));

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
          // Position only: a full `layout` animation resizes the column by
          // scaling it (measured: scaleX 1.63 / scaleY 0.59 on open), which
          // visibly stretches every card, photo and glyph for ~300ms.
          layout="position"
          // Only animate layout when the map opens/closes. Without the
          // dependency framer re-animates on ANY size change, so appending a
          // page of cards made the whole column jump.
          layoutDependency={mapMode}
          transition={{ duration: 0.32, ease: [0.32, 0.72, 0, 1] }}
          className={mapMode === "split" ? "min-w-0 flex-1 lg:max-w-[55%]" : "min-w-0 flex-1"}
        >
        <div className="mb-4">
          <SearchPill
            ref={searchPillRef}
            initialFilters={filters}
            collapsible
            onNewSearch={forgetCamera}
          />
        </div>

        <div className="mb-5">
          <QuickFilters
            filters={filters}
            activeFilterCount={activeFilterCount}
            onApply={applyFilters}
            onOpenFilters={() => setFiltersOpen(true)}
          />
        </div>

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
              {items.map((property, i) => (
                <PropertyCard
                  key={property.id}
                  property={property}
                  priority={i < 4}
                  highlighted={hoveredId === property.id || selectedId === property.id}
                  onHoverChange={(hovering) => setHoveredId(hovering ? property.id : null)}
                />
              ))}
            </section>
            <div ref={loadMoreRef} />

            <div className="flex justify-center py-9">
              {query.hasNextPage ? (
                query.isFetchingNextPage ? (
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                ) : null
              ) : (
                <div className="flex flex-col items-center gap-1 text-center text-muted-foreground">
                  <div className="mb-2 h-px w-8 bg-border" />
                  <div className="text-sm font-medium text-foreground">
                    You&apos;ve reached the end
                  </div>
                  <div className="text-[13px]">Showing all {total} stays</div>
                  {activeFilterCount > 0 ? (
                    <div className="mt-3 flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setFiltersOpen(true)}>
                        Change filters
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => applyFilters({ sort: filters.sort })}
                      >
                        Clear filters
                      </Button>
                    </div>
                  ) : null}
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
              // Height in dvh, not inset-0: a fixed element sizes to the layout
              // viewport, which stays short while a mobile URL bar hides, and
              // the difference shows up as a blank strip under the map.
              className="fixed inset-x-0 top-0 z-40 h-[100dvh] overflow-hidden bg-background lg:inset-auto lg:z-auto lg:h-[calc(100vh-7rem)] lg:max-w-[45%] lg:flex-1 lg:bg-transparent lg:sticky lg:top-22"
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
                  onSelectChange={handleSelectChange}
                  onBoundsChange={updateBounds}
                  onCollapse={collapseMap}
                  initialBounds={restoredCamera}
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
                    onClick={() => {
                      // Drop back to the list and open the search flow. The
                      // mobile search overlay is a body portal above the map,
                      // so no deferral is needed — and a setTimeout here could
                      // interleave the two scroll locks on slow devices.
                      collapseMap();
                      searchPillRef.current?.openWhere();
                    }}
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

              {/* The list itself, over the map. It replaces both the old
                  "Show list · N homes" button (the count now rides on the
                  handle) and the floating single-listing card: a tapped pin
                  scrolls the sheet to its card instead. */}
              {isMobile ? (
                <MapListSheet
                  count={total}
                  searching={showSkeleton || searching}
                  snap={sheetSnap}
                  onSnapChange={setSheetSnap}
                  selectedId={selectedId}
                  scrollRef={sheetScrollRef}
                >
                  {query.isError && items.length === 0 ? (
                    <div className="flex flex-col items-center gap-3 py-12 text-center">
                      <p className="text-sm text-destructive">{(query.error as Error).message}</p>
                      <Button variant="outline" size="sm" onClick={() => query.refetch()}>
                        Try again
                      </Button>
                    </div>
                  ) : showSkeleton ? (
                    <SheetSkeleton />
                  ) : items.length === 0 && !selectedListing ? (
                    <p className="py-12 text-center text-sm text-muted-foreground">
                      No stays in this area. Try moving the map or widening your filters.
                    </p>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {selectedListing ? (
                        <SelectedListingCard
                          listing={selectedListing}
                          onClose={() => setSelectedId(null)}
                          onNavigate={releaseOverlayHistory}
                        />
                      ) : null}
                      {sheetItems.map((property) => (
                        <div key={property.id} data-property-id={property.id}>
                          <PropertyCard
                            property={property}
                            highlighted={selectedId === property.id}
                            onNavigate={releaseOverlayHistory}
                          />
                        </div>
                      ))}
                      <div ref={sheetLoadMoreRef} />
                      {query.isFetchingNextPage ? (
                        <div className="flex justify-center py-4">
                          <Loader2 className="size-5 animate-spin text-muted-foreground" />
                        </div>
                      ) : !query.hasNextPage && items.length > 0 ? (
                        <p className="py-4 text-center text-[13px] text-muted-foreground">
                          Showing all {total} stays
                        </p>
                      ) : null}
                    </div>
                  )}
                </MapListSheet>
              ) : null}
            </motion.div>
          ) : null}
        </AnimatePresence>
        </div>
      </main>

      {/* Toggle. On mobile the open map has its own back arrow, so this hides
          while the overlay is up; on desktop it stays as the Show list/map
          switch. Sits above the mobile tab bar (which is ~4rem plus the home
          indicator) so it never covers the tab labels. */}
      <div
        className={`fixed inset-x-0 bottom-[calc(5.25rem+env(safe-area-inset-bottom))] z-50 justify-center lg:bottom-6 ${
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

function SheetSkeleton() {
  return (
    <div className="flex flex-col gap-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border">
          <div className="aspect-[4/3] animate-pulse bg-muted" />
          <div className="flex flex-col gap-2 px-4 pt-3 pb-4">
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-2/5 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * The fields the selected card needs. A loaded search result carries all of
 * them; a bare map marker carries everything but `city` and `description`,
 * which is why an unloaded selection fetches its listing (see the detail query
 * in BrowseResults) instead of rendering a thinner card than the ones below it.
 */
type PinnedListing = Pick<
  PropertyMapMarker,
  "id" | "title" | "images" | "pricePerNight" | "averageRating"
> & { city?: string; description?: string };

/**
 * The listing a pin tap selected, sitting above the list.
 *
 * It reads like the cards under it on purpose: it was compact at first, and
 * that inverted the hierarchy — the one thing the visitor had just chosen was
 * the smallest thing on screen. The photo is shorter than a list card's (16/10
 * against 4/3) so a strip of the next card still shows at the half snap, which
 * is what says there's a list underneath rather than a dead end.
 */
function SelectedListingCard({
  listing,
  onClose,
  onNavigate,
}: {
  listing: PinnedListing;
  onClose: () => void;
  onNavigate: () => void;
}) {
  const rating = formatRating(listing.averageRating);
  return (
    <Card
      data-property-id={listing.id}
      className="relative gap-0 overflow-hidden border-ring p-0 ring-2 ring-ring"
    >
      {/* Close sits opposite the heart, which the card keeps from the list. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute top-2.5 left-2.5 z-20 flex size-8 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm active:scale-90"
      >
        <X className="size-4" />
      </button>
      <Link href={`/properties/${listing.id}`} onClick={onNavigate} className="block">
        <div
          className="relative flex aspect-[16/10] items-center justify-center"
          style={{ backgroundImage: PHOTO_STRIPES }}
        >
          <FavoriteButton propertyId={listing.id} variant="overlay" />
          {listing.images[0] ? (
            <Image
              src={photoUrl(listing.images[0])}
              alt={listing.title}
              fill
              sizes="(max-width: 640px) 100vw, 360px"
              className="object-cover"
            />
          ) : null}
        </div>
        <div className="px-4 pt-3 pb-4">
          <div className="flex items-start justify-between gap-2">
            <span className="line-clamp-2 text-[15px] leading-snug font-semibold">
              {listing.title}
            </span>
            {rating ? (
              <span className="inline-flex shrink-0 items-center gap-1 text-[13px] leading-snug">
                <Star className="size-3.5 fill-current" />
                {rating}
              </span>
            ) : null}
          </div>
          {listing.city ? (
            <div className="mt-0.5 text-sm text-muted-foreground">{listing.city}</div>
          ) : null}
          {listing.description ? (
            <p className="mt-2 line-clamp-2 text-[13px] text-muted-foreground">
              {listing.description}
            </p>
          ) : null}
          <div className="mt-2.5 text-sm">
            <strong className="font-semibold">{formatPrice(listing.pricePerNight)}</strong>{" "}
            <span className="text-muted-foreground">night</span>
          </div>
        </div>
      </Link>
    </Card>
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
