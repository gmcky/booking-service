"use client";

import * as React from "react";
import maplibregl from "maplibre-gl";
import { BaseMap } from "@/components/map/base-map";

/**
 * Draggable-pin mini-map for the host form. Seeds a marker at the given
 * coordinates; clicking the map or dragging the marker reports the new
 * position. Only loaded client-side (dynamic import with ssr:false), so
 * touching maplibre-gl directly is safe. Remount (via key) when the geocoded
 * pin changes; a drag mutates the marker in place without remounting.
 */
export function LocationPinMap({
  latitude,
  longitude,
  onChange,
}: {
  latitude: number;
  longitude: number;
  onChange: (coords: { latitude: number; longitude: number }) => void;
}) {
  const markerRef = React.useRef<maplibregl.Marker | null>(null);
  const onChangeRef = React.useRef(onChange);
  onChangeRef.current = onChange;

  function handleMapReady(map: maplibregl.Map) {
    const el = document.createElement("div");
    el.className =
      "size-4 cursor-grab rounded-full border-2 border-background bg-foreground shadow-md ring-2 ring-foreground/20";
    const marker = new maplibregl.Marker({ element: el, anchor: "center", draggable: true })
      .setLngLat([longitude, latitude])
      .addTo(map);
    marker.on("dragend", () => {
      const { lng, lat } = marker.getLngLat();
      onChangeRef.current({ latitude: lat, longitude: lng });
    });
    markerRef.current = marker;
  }

  function handlePointClick(lngLat: { lng: number; lat: number }) {
    markerRef.current?.setLngLat([lngLat.lng, lngLat.lat]);
    onChangeRef.current({ latitude: lngLat.lat, longitude: lngLat.lng });
  }

  return (
    <BaseMap
      center={[longitude, latitude]}
      zoom={14}
      onMapReady={handleMapReady}
      onMapPointClick={handlePointClick}
      scrollZoomOnClick
      className="h-[260px] w-full overflow-hidden rounded-lg border border-border"
    />
  );
}
