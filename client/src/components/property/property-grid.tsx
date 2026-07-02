"use client";

import { useQuery } from "@tanstack/react-query";
import { propertyApi, type PropertyQuery } from "@/lib/api/properties";
import { PropertyCard } from "./property-card";

export function PropertyGrid({
  query = {},
  emptyLabel = "No stays found.",
}: {
  query?: PropertyQuery;
  emptyLabel?: string;
}) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["properties", query],
    queryFn: () => propertyApi.search(query),
  });

  if (isPending) {
    return (
      <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
        {Array.from({ length: query.limit ?? 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[296px] animate-pulse rounded-xl border border-border bg-muted/40"
          />
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="py-12 text-center text-sm text-destructive">
        {(error as Error).message}
      </p>
    );
  }

  if (data.data.length === 0) {
    return <p className="py-12 text-center text-sm text-muted-foreground">{emptyLabel}</p>;
  }

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
      {data.data.map((property) => (
        <PropertyCard key={property.id} property={property} />
      ))}
    </div>
  );
}
