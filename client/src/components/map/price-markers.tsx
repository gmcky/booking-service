"use client";

import * as React from "react";
import maplibregl from "maplibre-gl";
import { cn } from "@/lib/utils";
import { formatPrice } from "@/lib/utils/money";

export interface PriceMarkerProperty {
  id: string;
  latitude: number;
  longitude: number;
  pricePerNight: string;
}

export interface PriceMarkersProps {
  map: maplibregl.Map | null;
  properties: PriceMarkerProperty[];
  selectedId?: string | null;
  hoveredId?: string | null;
  onSelect?: (id: string) => void;
  onHover?: (id: string | null) => void;
}

/**
 * Imperatively manages maplibregl.Marker price pills against a live map
 * instance. Markers are plain DOM (maplibre's Marker API takes an
 * HTMLElement, not JSX) so this renders nothing itself — it's a
 * synchronization effect, not a visual component.
 */
export function PriceMarkers({
  map,
  properties,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
}: PriceMarkersProps) {
  const markersRef = React.useRef(new Map<string, maplibregl.Marker>());
  const onSelectRef = React.useRef(onSelect);
  const onHoverRef = React.useRef(onHover);
  onSelectRef.current = onSelect;
  onHoverRef.current = onHover;

  // Reconcile the marker set against the current property list. Callback
  // identity is read from refs (not a dep here) so a fresh onSelect/onHover
  // closure on every parent render never tears down and recreates markers.
  React.useEffect(() => {
    if (!map) return;
    const markers = markersRef.current;
    const nextIds = new Set(properties.map((p) => p.id));

    for (const [id, marker] of markers) {
      if (!nextIds.has(id)) {
        marker.remove();
        markers.delete(id);
      }
    }

    for (const property of properties) {
      if (markers.has(property.id)) continue;

      const el = document.createElement("div");
      el.textContent = formatPrice(property.pricePerNight);
      el.className = pillClassName({ selected: false, hovered: false });
      el.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current?.(property.id);
      });
      el.addEventListener("mouseenter", () => onHoverRef.current?.(property.id));
      el.addEventListener("mouseleave", () => onHoverRef.current?.(null));

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([property.longitude, property.latitude])
        .addTo(map);
      markers.set(property.id, marker);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, properties]);

  // Style sync only — selected/hovered state never recreates a marker.
  React.useEffect(() => {
    for (const [id, marker] of markersRef.current) {
      const el = marker.getElement();
      const selected = id === selectedId;
      const hovered = id === hoveredId;
      el.className = pillClassName({ selected, hovered });
      el.style.zIndex = selected || hovered ? "10" : "0";
    }
  }, [selectedId, hoveredId, properties]);

  // Full cleanup on unmount (or if the map instance itself changes).
  React.useEffect(() => {
    const markers = markersRef.current;
    return () => {
      for (const marker of markers.values()) marker.remove();
      markers.clear();
    };
  }, [map]);

  return null;
}

function pillClassName({ selected, hovered }: { selected: boolean; hovered: boolean }): string {
  return cn(
    "flex items-center justify-center rounded-full border px-2.5 py-1 text-sm font-semibold shadow-sm transition-transform cursor-pointer select-none",
    selected
      ? "border-foreground bg-foreground text-background"
      : "border-border bg-card text-foreground hover:shadow-md",
    hovered && !selected ? "scale-110" : "scale-100",
  );
}
