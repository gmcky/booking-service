"use client";

import * as React from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { cn } from "@/lib/utils";

/** OpenFreeMap keyless vector tiles — subtle/muted, matches the app's palette. */
export const MAP_STYLE_URL = "https://tiles.openfreemap.org/styles/positron";

export interface MapBounds {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
}

/**
 * getBounds() returns unwrapped longitudes — at low zoom (or panned across
 * the antimeridian) west/east can exceed ±180, which the search API rejects.
 * Clamp to the API's domain; a viewport wider than the world just becomes
 * "the whole world".
 */
function clampBounds(b: maplibregl.LngLatBounds): MapBounds {
  return {
    minLat: Math.max(b.getSouth(), -90),
    maxLat: Math.min(b.getNorth(), 90),
    minLng: Math.max(b.getWest(), -180),
    maxLng: Math.min(b.getEast(), 180),
  };
}

export interface BaseMapProps {
  /** [lng, lat]. Ignored once `bounds` is provided. */
  center?: [number, number];
  zoom?: number;
  /** [[west, south], [east, north]] — takes priority over center/zoom on mount. */
  bounds?: [[number, number], [number, number]];
  /**
   * Fires after any pan/zoom settles. `isUserGesture` is false for
   * programmatic camera changes (fitBounds/jumpTo/flyTo) so consumers can
   * tell "the user panned the map" apart from "we just fit new results".
   */
  onMoveEnd?: (bounds: MapBounds, isUserGesture: boolean) => void;
  onMapClick?: () => void;
  /** Hands the live map instance up once the style has loaded, for marker layers. */
  onMapReady?: (map: maplibregl.Map) => void;
  navigationControl?: boolean;
  fullscreenControl?: boolean;
  /**
   * Scroll-to-zoom starts disabled and turns on after the user clicks the
   * map once — a "cooperative gestures" feel without maplibre's ctrl+scroll
   * hint UI, so an embedded map never hijacks page scroll.
   */
  scrollZoomOnClick?: boolean;
  className?: string;
}

/**
 * Thin owner of the maplibregl.Map lifecycle. Renders only the container —
 * markers/popups are managed by consumers via `onMapReady`, imperatively,
 * against the same map instance (see price-markers.tsx).
 */
export function BaseMap({
  center,
  zoom = 12,
  bounds,
  onMoveEnd,
  onMapClick,
  onMapReady,
  navigationControl = true,
  fullscreenControl = false,
  scrollZoomOnClick = false,
  className,
}: BaseMapProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);
  const mapRef = React.useRef<maplibregl.Map | null>(null);

  // Callbacks are read from refs inside the map's event handlers so the
  // effect below never needs to re-run (and re-create the map) when a
  // parent passes a fresh closure on every render.
  const onMoveEndRef = React.useRef(onMoveEnd);
  const onMapClickRef = React.useRef(onMapClick);
  const onMapReadyRef = React.useRef(onMapReady);
  onMoveEndRef.current = onMoveEnd;
  onMapClickRef.current = onMapClick;
  onMapReadyRef.current = onMapReady;

  React.useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: MAP_STYLE_URL,
      center: bounds ? undefined : (center ?? [0, 20]),
      zoom: bounds ? undefined : (center ? zoom : 1.5),
      attributionControl: { compact: true },
    });
    mapRef.current = map;

    if (bounds) {
      map.fitBounds(bounds, { padding: 48, animate: false });
    }

    if (navigationControl) {
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    }
    if (fullscreenControl) {
      map.addControl(new maplibregl.FullscreenControl(), "top-right");
    }

    if (scrollZoomOnClick) {
      map.scrollZoom.disable();
      map.once("click", () => map.scrollZoom.enable());
    }

    // Drag inertia settles via a programmatic ease, so moveend's originalEvent
    // is undefined for flick-pans — the gesture must be captured at movestart,
    // which fires once per move session with the initiating input event.
    let moveByUser = false;
    map.on("movestart", (e) => {
      moveByUser = Boolean(e.originalEvent);
    });
    map.on("moveend", (e) => {
      const isUserGesture = moveByUser || Boolean(e.originalEvent);
      moveByUser = false;
      onMoveEndRef.current?.(clampBounds(map.getBounds()), isUserGesture);
    });
    map.on("click", () => onMapClickRef.current?.());
    map.on("load", () => onMapReadyRef.current?.(map));

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // Mount once; props that should reach the running map (bounds updates,
    // etc.) are applied imperatively by the consumer via the map instance.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <div ref={containerRef} className={cn("size-full", className)} />;
}
