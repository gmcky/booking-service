"use client";

import { useQuery } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query/keys";
import type { DetectedLocation } from "@/lib/geo/detect-location";

/** The request's origin doesn't move during a session. */
const GEO_STALE_MS = 60 * 60 * 1000;

async function fetchDetectedLocation(): Promise<DetectedLocation> {
  const res = await fetch("/api/geo");
  // Geo is a nicety everywhere it's used — a failure degrades to "unknown"
  // rather than surfacing an error state.
  if (!res.ok) return {};
  return (await res.json()) as DetectedLocation;
}

/**
 * Geo detection for client components. Deliberately not a server prop: the
 * header read that produces it would make every consuming page dynamic (see
 * `app/api/geo/route.ts`).
 */
export function useDetectedLocation(): DetectedLocation | undefined {
  const { data } = useQuery({
    queryKey: queryKeys.geo,
    queryFn: fetchDetectedLocation,
    staleTime: GEO_STALE_MS,
    gcTime: GEO_STALE_MS,
    retry: false,
  });
  return data;
}
