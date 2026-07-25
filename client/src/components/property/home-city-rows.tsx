"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { propertyApi } from "@/lib/api/properties";
import { queryKeys } from "@/lib/query/keys";
import { PropertyCard } from "@/components/property/property-card";
import { Carousel } from "@/components/ui/carousel";
import { useDetectedLocation } from "@/lib/geo/use-detected-location";
import { resolveNearbyCity } from "@/lib/geo/nearby";

const MIN_CITY_LISTINGS = 3; // only cities with enough inventory to fill a row
const TOP_POOL = 8; // rotate the shown rows within the top N eligible cities
// Kept below the number of cities that usually qualify, otherwise every
// eligible city is shown every day and the rotation below never rotates.
const ROWS = 3;
const PER_ROW = 8;
const STALE = 5 * 60 * 1000;

// Day-of-year, so the row selection is stable within a day (no layout jump on
// refetch) but rotates day to day.
function dayOfYear(now = new Date()): number {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return Math.floor((today - start) / 86_400_000);
}

function pickCities(cities: { city: string; count: number }[]): string[] {
  const eligible = cities
    .filter((c) => c.count >= MIN_CITY_LISTINGS)
    .sort((a, b) => b.count - a.count)
    .slice(0, TOP_POOL);

  if (eligible.length <= ROWS) return eligible.map((c) => c.city);

  const offset = dayOfYear() % eligible.length;
  const picked: string[] = [];
  for (let i = 0; i < ROWS; i++) {
    picked.push(eligible[(offset + i) % eligible.length]!.city);
  }
  return picked;
}

export function HomeCityRows() {
  const detected = useDetectedLocation();
  const { data } = useQuery({
    queryKey: queryKeys.properties.locations,
    queryFn: () => propertyApi.locations(),
    staleTime: STALE,
  });

  if (!data) return null;

  const cities = data.flatMap((country) =>
    country.cities.map((c) => ({ city: c.city, count: c.count })),
  );

  const nearby = resolveNearbyCity(data, detected)?.city;
  // Don't repeat the near-you city in the inventory rows below it.
  const picked = pickCities(cities).filter((c) => c !== nearby);
  if (!nearby && picked.length === 0) return null;

  return (
    <>
      {nearby ? (
        <CityRow key={`nearby-${nearby}`} city={nearby} heading={`Stays near you · ${nearby}`} />
      ) : null}
      {picked.map((city) => (
        <CityRow key={city} city={city} />
      ))}
    </>
  );
}

function CityRow({ city, heading }: { city: string; heading?: string }) {
  const { data } = useQuery({
    queryKey: queryKeys.properties.list({ city, limit: PER_ROW }),
    queryFn: () => propertyApi.search({ city, limit: PER_ROW }),
    staleTime: STALE,
  });

  const items = data?.data ?? [];
  // Hide the whole row while loading or when empty — no skeleton parade on home.
  if (items.length === 0) return null;

  return (
    <section className="pt-14 duration-500 animate-in fade-in slide-in-from-bottom-2 motion-reduce:animate-none">
      <Carousel
        heading={
          <div className="flex items-baseline gap-3">
            <h2 className="text-[22px] font-semibold tracking-tight">
              {heading ?? `Stays in ${city}`}
            </h2>
            <Link
              href={`/browse?city=${encodeURIComponent(city)}`}
              className="inline-flex shrink-0 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
            >
              View all
              <ArrowRight className="size-[15px]" />
            </Link>
          </div>
        }
        itemClassName="basis-full sm:basis-1/2 lg:basis-1/3 xl:basis-1/4"
      >
        {items.map((property) => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </Carousel>
    </section>
  );
}
