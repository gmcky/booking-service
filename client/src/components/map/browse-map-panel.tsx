"use client";

import * as React from "react";
import Link from "next/link";
import { Star, X } from "lucide-react";
import maplibregl from "maplibre-gl";
import { BaseMap, type MapBounds } from "@/components/map/base-map";
import { PriceMarkers } from "@/components/map/price-markers";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { formatPrice, formatRating } from "@/lib/utils/money";
import { PHOTO_STRIPES, photoUrl } from "@/lib/utils/photo";
import type { Property } from "@/lib/api/properties";

const SEARCH_AS_MOVE_DEBOUNCE_MS = 500;

type GeoProperty = Property & { latitude: number; longitude: number };

function hasCoords(property: Property): property is GeoProperty {
  return property.latitude != null && property.longitude != null;
}

function boundsOf(properties: GeoProperty[]): [[number, number], [number, number]] | undefined {
  if (properties.length === 0) return undefined;
  const bounds = new maplibregl.LngLatBounds();
  for (const p of properties) bounds.extend([p.longitude, p.latitude]);
  return [
    [bounds.getWest(), bounds.getSouth()],
    [bounds.getEast(), bounds.getNorth()],
  ];
}

export interface BrowseMapPanelProps {
  properties: Property[];
  hoveredId: string | null;
  onHoverChange: (id: string | null) => void;
  selectedId: string | null;
  onSelectChange: (id: string | null) => void;
  searchAsMove: boolean;
  onSearchAsMoveChange: (checked: boolean) => void;
  /** Debounced (search-as-I-move) or immediate ("Search this area") bbox push into the URL. */
  onBoundsChange: (bounds: MapBounds) => void;
  /**
   * Changes only when a "real" new search happened (filters other than the
   * map's own bbox) — re-fits the camera to the new result set, unless the
   * user has since panned the map by hand.
   */
  fitBoundsKey: string;
}

export function BrowseMapPanel({
  properties,
  hoveredId,
  onHoverChange,
  selectedId,
  onSelectChange,
  searchAsMove,
  onSearchAsMoveChange,
  onBoundsChange,
  fitBoundsKey,
}: BrowseMapPanelProps) {
  const [map, setMap] = React.useState<maplibregl.Map | null>(null);
  const [pendingBounds, setPendingBounds] = React.useState<MapBounds | null>(null);
  const debounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const geoProperties = React.useMemo(() => properties.filter(hasCoords), [properties]);
  const selected = geoProperties.find((p) => p.id === selectedId) ?? null;

  // New search (city/filters/sort changed, not a map pan) — refit to results.
  // A new search also drops bbox params, so yanking the camera is correct;
  // pans that keep the current search (bbox-only changes) never land here.
  React.useEffect(() => {
    setPendingBounds(null);
    if (!map) return;
    const bounds = boundsOf(geoProperties);
    if (bounds) {
      map.fitBounds(bounds, { padding: 64, animate: false, maxZoom: 15 });
    }
    // Only re-fit on an actual new search or once the map first becomes ready.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitBoundsKey, map]);

  function handleMoveEnd(bounds: MapBounds, isUserGesture: boolean) {
    if (!isUserGesture) return;

    if (searchAsMove) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => onBoundsChange(bounds), SEARCH_AS_MOVE_DEBOUNCE_MS);
    } else {
      setPendingBounds(bounds);
    }
  }

  React.useEffect(() => {
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, []);

  function handleSearchThisArea() {
    if (!pendingBounds) return;
    onBoundsChange(pendingBounds);
    setPendingBounds(null);
  }

  const rating = selected ? formatRating(selected.averageRating) : null;

  return (
    <div className="relative size-full overflow-hidden rounded-xl">
      <BaseMap
        onMapReady={setMap}
        onMoveEnd={handleMoveEnd}
        onMapClick={() => onSelectChange(null)}
        className="size-full"
      />

      <PriceMarkers
        map={map}
        properties={geoProperties}
        selectedId={selectedId}
        hoveredId={hoveredId}
        onSelect={onSelectChange}
        onHover={onHoverChange}
      />

      <Card className="absolute top-3 left-3 z-10 flex-row items-center gap-2 px-3 py-2 shadow-md">
        <Switch
          id="search-as-move"
          checked={searchAsMove}
          onCheckedChange={(checked) => {
            onSearchAsMoveChange(checked);
            if (!checked && debounceRef.current) clearTimeout(debounceRef.current);
            if (checked && pendingBounds) {
              onBoundsChange(pendingBounds);
              setPendingBounds(null);
            }
          }}
        />
        <Label htmlFor="search-as-move" className="text-xs font-medium">
          Search as I move the map
        </Label>
      </Card>

      {!searchAsMove && pendingBounds ? (
        <div className="absolute top-3 left-1/2 z-10 -translate-x-1/2">
          <Button size="sm" className="shadow-md" onClick={handleSearchThisArea}>
            Search this area
          </Button>
        </div>
      ) : null}

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
