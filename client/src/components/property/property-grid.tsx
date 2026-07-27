"use client";

import { useQuery } from "@tanstack/react-query";
import { motion, useReducedMotion } from "motion/react";
import { propertyApi, type PropertyQuery } from "@/lib/api/properties";
import { queryKeys } from "@/lib/query/keys";
import { PropertyCard } from "./property-card";

const GRID_CLASS = "grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6";

const container = { show: { transition: { staggerChildren: 0.05 } } };
const item = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: { duration: 0.35, ease: "easeOut" as const } },
};

export function PropertyGrid({
  query = {},
  emptyLabel = "No stays found.",
}: {
  query?: PropertyQuery;
  emptyLabel?: string;
}) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.properties.list(query),
    queryFn: () => propertyApi.search(query),
  });

  const reduce = useReducedMotion();

  if (isPending) {
    return (
      <div className={GRID_CLASS}>
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

  if (reduce) {
    return (
      <div className={GRID_CLASS}>
        {data.data.map((property, i) => (
          <PropertyCard key={property.id} property={property} priority={i < 4} />
        ))}
      </div>
    );
  }

  return (
    <motion.div className={GRID_CLASS} variants={container} initial="hidden" animate="show">
      {data.data.map((property, i) => (
        <motion.div key={property.id} variants={item}>
          <PropertyCard property={property} priority={i < 4} />
        </motion.div>
      ))}
    </motion.div>
  );
}
