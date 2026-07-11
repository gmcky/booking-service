"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronsRight, Loader2, Star, X } from "lucide-react";
import maplibregl from "maplibre-gl";
import { BaseMap, type MapBounds } from "@/components/map/base-map";
import { PriceMarkers } from "@/components/map/price-markers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatPrice, formatRating } from "@/lib/utils/money";
import { isMinorMove } from "@/lib/utils/map-bounds";
import { PHOTO_STRIPES, photoUrl } from "@/lib/utils/photo";
import type { PropertyMapMarker } from "@/lib/api/properties";

const SEARCH_AS_MOVE_DEBOUNCE_MS = 500;

function boundsOf(markers: PropertyMapMarker[]): [[number, number], [number, number]] | undefined {
  if (markers.length === 0) return undefined;
  const bounds = new maplibregl.LngLatBounds();
  for (const m of markers) bounds.extend([m.longitude, m.latitude]);
  return [
    [bounds.getWest(), bounds.getSouth()],
    [bounds.getEast(), bounds.getNorth()],
  ];
}

export interface BrowseMapPanelProps {
  markers: PropertyMapMarker[];
  /** True while the markers query for the current filters is still loading. */
  markersPending: boolean;
  /**
   * True while list/marker results for the current viewport are being
   * fetched — shows the top-center spinner. Kept separate from
   * markersPending, which gates the camera refit.
   */
  searching?: boolean;
  hoveredId: string | null;
  onHoverChange: (id: string | null) => void;
  selectedId: string | null;
  onSelectChange: (id: string | null) => void;
  /** Debounced bbox push into the URL — the list always follows the map. */
  onBoundsChange: (bounds: MapBounds) => void;
  /** Collapses the map back to list-only view. */
  onCollapse: () => void;
  /**
   * Camera restore for remounts (page reload, map reopened) while a bbox
   * search is active — [[west, south], [east, north]].
   */
  initialBounds?: [[number, number], [number, number]];
  /**
   * Changes only when a "real" new search happened (filters other than the
   * map's own bbox); empty while a bbox drives the search. On change the
   * camera re-fits to the new result set once its markers arrive.
   */
  fitBoundsKey: string;
}

export function BrowseMapPanel({
  markers,
  markersPending,
  searching = false,
  hoveredId,
  onHoverChange,
  selectedId,
  onSelectChange,
  onBoundsChange,
  onCollapse,
  initialBounds,
  fitBoundsKey,
}: BrowseMapPanelProps) {
  const [map, setMap] = React.useState<maplibregl.Map | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastFitKeyRef = React.useRef<string | null>(null);

  const selected = markers.find((m) => m.id === selectedId) ?? null;

  // New search (city/filters changed, not a map pan) — refit to results once
  // per key, and only after the markers for that search have arrived. Pans
  // keep fitBoundsKey empty, so the camera is never yanked mid-exploration.
  React.useEffect(() => {
    // A pan (empty key) resets the gate: re-running the previous named
    // search afterwards must still yank the camera back to its results.
    if (!fitBoundsKey) {
      lastFitKeyRef.current = null;
      return;
    }
    if (!map || markersPending) return;
    if (lastFitKeyRef.current === fitBoundsKey) return;
    lastFitKeyRef.current = fitBoundsKey;
    const bounds = boundsOf(markers);
    if (bounds) {
      map.fitBounds(bounds, { padding: 64, animate: false, maxZoom: 15 });
    }
    // Markers themselves aren't a refit trigger — only the key flipping is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitBoundsKey, map, markersPending]);

  const lastSentBoundsRef = React.useRef<MapBounds | null>(null);

  function handleMoveEnd(bounds: MapBounds, isUserGesture: boolean) {
    if (!isUserGesture) return;
    // Micro-drags and inertia wobble don't change what the user sees —
    // skipping them saves two API requests per twitch.
    if (lastSentBoundsRef.current && isMinorMove(lastSentBoundsRef.current, bounds)) return;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      lastSentBoundsRef.current = bounds;
      onBoundsChange(bounds);
    }, SEARCH_AS_MOVE_DEBOUNCE_MS);
  }

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  const rating = selected ? formatRating(selected.averageRating) : null;

  return (
    <div className="relative size-full overflow-hidden rounded-xl">
      <BaseMap
        bounds={initialBounds}
        onMapReady={setMap}
        onMoveEnd={handleMoveEnd}
        onMapClick={() => onSelectChange(null)}
        className="size-full"
      />

      <PriceMarkers
        map={map}
        properties={markers}
        selectedId={selectedId}
        hoveredId={hoveredId}
        onSelect={onSelectChange}
        onHover={onHoverChange}
      />

      {searching ? (
        <div
          role="status"
          aria-label="Loading results"
          className="absolute top-3 left-1/2 z-10 -translate-x-1/2 rounded-full border border-border bg-card p-2 shadow-md"
        >
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        </div>
      ) : null}

      <div className="absolute top-3 left-3 z-10">
        <Button
          variant="secondary"
          size="icon"
          aria-label="Hide map"
          onClick={onCollapse}
          className="rounded-full border border-border bg-card shadow-md hover:bg-card"
        >
          <ChevronsRight className="size-4" />
        </Button>
      </div>

      {selected ? (
        <Card className="absolute bottom-3 left-3 z-10 w-64 gap-0 overflow-hidden p-0 shadow-lg">
          <button
            type="button"
            aria-label="Close"
            onClick={() => onSelectChange(null)}
            className="absolute top-2 right-2 z-10 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm"
          >
            <X className="size-3.5" />
          </button>
          <Link href={`/properties/${selected.id}`} className="block">
            <div
              className="relative flex aspect-[4/3] items-center justify-center"
              style={{ backgroundImage: PHOTO_STRIPES }}
            >
              {selected.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl(selected.images[0])}
                  alt={selected.title}
                  className="size-full object-cover"
                />
              ) : null}
            </div>
            <div className="p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold">{selected.title}</span>
                {rating ? (
                  <span className="inline-flex shrink-0 items-center gap-1 text-xs">
                    <Star className="size-3 fill-current" />
                    {rating}
                  </span>
                ) : null}
              </div>
              <div className="mt-1.5 text-sm">
                <strong className="font-semibold">{formatPrice(selected.pricePerNight)}</strong>{" "}
                <span className="text-muted-foreground">night</span>
              </div>
            </div>
          </Link>
        </Card>
      ) : null}
    </div>
  );
}
