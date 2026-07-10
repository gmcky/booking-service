"use client";

import * as React from "react";
import maplibregl from "maplibre-gl";
import { BaseMap } from "@/components/map/base-map";

/**
 * Only ever loaded client-side (see where-youll-be.tsx's dynamic import with
 * ssr: false) — safe to touch maplibre-gl directly.
 */
export function WhereYoullBeMap({
  latitude,
  longitude,
}: {
  latitude: number;
  longitude: number;
}) {
  const markerRef = React.useRef<maplibregl.Marker | null>(null);

  function handleMapReady(map: maplibregl.Map) {
    const el = document.createElement("div");
    el.className =
      "size-4 rounded-full border-2 border-background bg-foreground shadow-md ring-2 ring-foreground/20";
    markerRef.current = new maplibregl.Marker({ element: el, anchor: "center" })
      .setLngLat([longitude, latitude])
      .addTo(map);
  }

  return (
    <BaseMap
      center={[longitude, latitude]}
      zoom={13}
      onMapReady={handleMapReady}
      scrollZoomOnClick
      fullscreenControl
      className="h-[420px] w-full overflow-hidden rounded-xl"
    />
  );
}
