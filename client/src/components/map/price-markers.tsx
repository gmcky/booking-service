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

interface MarkerEntry {
  marker: maplibregl.Marker;
  label: string;
}

/** Estimated pill footprint in screen px, used for collision detection. */
const PILL_HEIGHT = 32;
const PILL_CHAR_WIDTH = 8;
const PILL_PADDING = 24;
/** A collapsed marker's dot, plus a little breathing room around it. */
const DOT_SIZE = 12;
const DOT_MARGIN = 4;

/**
 * Imperatively manages maplibregl.Marker price pills against a live map
 * instance. Markers are plain DOM (maplibre's Marker API takes an
 * HTMLElement, not JSX) so this renders nothing itself — it's a
 * synchronization effect, not a visual component.
 *
 * Markers self-declutter Airbnb-style: pills that would overlap an
 * already-placed pill collapse into small dots, recomputed on every camera
 * change. Selected/hovered markers always win a pill slot.
 */
export function PriceMarkers({
  map,
  properties,
  selectedId,
  hoveredId,
  onSelect,
  onHover,
}: PriceMarkersProps) {
  const markersRef = React.useRef(new Map<string, MarkerEntry>());
  const onSelectRef = React.useRef(onSelect);
  const onHoverRef = React.useRef(onHover);
  onSelectRef.current = onSelect;
  onHoverRef.current = onHover;

  // Read by declutter() so camera-event listeners never need re-binding
  // when the selection changes.
  const selectionRef = React.useRef({ selectedId, hoveredId });
  selectionRef.current = { selectedId, hoveredId };

  const declutterRef = React.useRef(() => {});
  declutterRef.current = () => {
    if (!map) return;
    const { selectedId, hoveredId } = selectionRef.current;
    const entries = [...markersRef.current.entries()];
    // Selected/hovered first so they always claim their pill slot.
    entries.sort(
      ([a], [b]) => priorityOf(b, selectedId, hoveredId) - priorityOf(a, selectedId, hoveredId),
    );

    type Rect = { x1: number; y1: number; x2: number; y2: number };
    const placed: Rect[] = [];
    const free = (r: Rect) =>
      !placed.some((p) => r.x1 < p.x2 && r.x2 > p.x1 && r.y1 < p.y2 && r.y2 > p.y1);
    const boxAt = (x: number, y: number, w: number, h: number): Rect => ({
      x1: x - w / 2,
      y1: y - h / 2,
      x2: x + w / 2,
      y2: y + h / 2,
    });

    for (const [id, { marker, label }] of entries) {
      const { x, y } = map.project(marker.getLngLat());
      const selected = id === selectedId;
      const hovered = id === hoveredId;
      const pill = pillOf(marker);
      const element = marker.getElement();

      const pillRect = boxAt(x, y, label.length * PILL_CHAR_WIDTH + PILL_PADDING, PILL_HEIGHT);
      const dotRect = boxAt(x, y, DOT_SIZE + DOT_MARGIN * 2, DOT_SIZE + DOT_MARGIN * 2);

      // Three tiers, and every visible marker claims the pixels it occupies.
      // Dots used to claim nothing, so a dot could sit inside a neighbouring
      // pill: you tapped a dot you could plainly see, the pill on top of it
      // answered, and the sheet opened a listing you didn't pick. Flipping the
      // z-order only moved the problem onto the pills. A marker with no room
      // of its own is hidden instead — zooming in is what pulls markers apart,
      // and it brings them straight back.
      if (free(pillRect)) {
        placed.push(pillRect);
        element.style.display = "";
        pill.className = pillClassName({ selected, hovered });
        if (pill.textContent !== label) pill.textContent = label;
        element.style.zIndex = selected || hovered ? "30" : "10";
      } else if (free(dotRect)) {
        placed.push(dotRect);
        element.style.display = "";
        pill.className = dotClassName({ selected, hovered });
        pill.textContent = "";
        element.style.zIndex = selected || hovered ? "30" : "20";
      } else {
        // Selected and hovered sort first, so they never land here.
        element.style.display = "none";
      }
    }
  };

  // Reconcile the marker set against the current property list. Callback
  // identity is read from refs (not a dep here) so a fresh onSelect/onHover
  // closure on every parent render never tears down and recreates markers.
  React.useEffect(() => {
    if (!map) return;
    const markers = markersRef.current;
    const nextIds = new Set(properties.map((p) => p.id));

    for (const [id, entry] of markers) {
      if (!nextIds.has(id)) {
        entry.marker.remove();
        markers.delete(id);
      }
    }

    for (const property of properties) {
      const label = formatPrice(property.pricePerNight);
      const existing = markers.get(property.id);
      if (existing) {
        existing.marker.setLngLat([property.longitude, property.latitude]);
        existing.label = label;
        pillOf(existing.marker).setAttribute("aria-label", `${label} per night, view listing`);
        continue;
      }

      // The marker element belongs to maplibre — it adds the
      // "maplibregl-marker" class (position: absolute) and positions via
      // inline transform. The pill lives on a child element so our styling
      // (and className rewrites on state sync) never clobbers that.
      const el = document.createElement("div");
      const pill = document.createElement("div");
      pill.setAttribute("role", "button");
      pill.setAttribute("tabindex", "0");
      pill.setAttribute("aria-label", `${label} per night, view listing`);
      pill.addEventListener("click", (e) => {
        e.stopPropagation();
        onSelectRef.current?.(property.id);
      });
      pill.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelectRef.current?.(property.id);
        }
      });
      pill.addEventListener("mouseenter", () => onHoverRef.current?.(property.id));
      pill.addEventListener("mouseleave", () => onHoverRef.current?.(null));
      el.appendChild(pill);

      const marker = new maplibregl.Marker({ element: el, anchor: "center" })
        .setLngLat([property.longitude, property.latitude])
        .addTo(map);
      // addTo() gives the marker root role="button" / aria-label="Map marker"
      // (only when absent, so this strip is one-time). The pill child is the
      // real control — keeping both would nest interactive elements.
      el.removeAttribute("role");
      el.removeAttribute("aria-label");
      markers.set(property.id, { marker, label });
    }

    declutterRef.current();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, properties]);

  // Pill/dot style is selection-dependent, so a selection change is a
  // declutter pass too (the hovered marker must win back a pill slot).
  React.useEffect(() => {
    declutterRef.current();
  }, [selectedId, hoveredId]);

  // Live declutter while the camera moves, rAF-throttled.
  React.useEffect(() => {
    if (!map) return;
    let raf = 0;
    const onMove = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        declutterRef.current();
      });
    };
    map.on("move", onMove);
    return () => {
      map.off("move", onMove);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [map]);

  // Full cleanup on unmount (or if the map instance itself changes).
  React.useEffect(() => {
    const markers = markersRef.current;
    return () => {
      for (const entry of markers.values()) entry.marker.remove();
      markers.clear();
    };
  }, [map]);

  return null;
}

function priorityOf(id: string, selectedId?: string | null, hoveredId?: string | null): number {
  return id === selectedId ? 2 : id === hoveredId ? 1 : 0;
}

function pillOf(marker: maplibregl.Marker): HTMLElement {
  return marker.getElement().firstElementChild as HTMLElement;
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

function dotClassName({ selected, hovered }: { selected: boolean; hovered: boolean }): string {
  return cn(
    "block size-3 rounded-full border shadow-sm cursor-pointer select-none transition-transform",
    selected ? "border-foreground bg-foreground" : "border-border bg-card",
    hovered && !selected ? "scale-125" : "scale-100",
  );
}
