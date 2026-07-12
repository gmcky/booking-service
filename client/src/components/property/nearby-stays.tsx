"use client";

import { useQuery } from "@tanstack/react-query";
import { propertyApi } from "@/lib/api/properties";
import { queryKeys } from "@/lib/query/keys";
import { PropertyCard } from "@/components/property/property-card";
import { Carousel } from "@/components/ui/carousel";

const FETCH_LIMIT = 13;
const CAP = 12;
const MIN_CITY_RESULTS = 2;

async function fetchNearby(propertyId: string, city: string, country: string) {
  const cityRes = await propertyApi.search({ city, limit: FETCH_LIMIT });
  const cityItems = cityRes.data.filter((p) => p.id !== propertyId).slice(0, CAP);
  if (cityItems.length >= MIN_CITY_RESULTS) {
    return { items: cityItems, mode: "city" as const };
  }

  // Too few other stays in the same city — widen to the country, but only
  // use it if it actually turns up more than the city search did.
  const countryRes = await propertyApi.search({ country, limit: FETCH_LIMIT });
  const countryItems = countryRes.data.filter((p) => p.id !== propertyId).slice(0, CAP);
  if (countryItems.length > cityItems.length) {
    return { items: countryItems, mode: "country" as const };
  }

  return { items: cityItems, mode: "city" as const };
}

export function NearbyStays({
  propertyId,
  city,
  country,
}: {
  propertyId: string;
  city: string;
  country: string;
}) {
  const { data, isError } = useQuery({
    queryKey: queryKeys.properties.nearby(propertyId, city, country),
    queryFn: () => fetchNearby(propertyId, city, country),
  });

  if (isError || !data || data.items.length === 0) return null;

  return (
    <div className="scroll-mt-32 border-t border-border py-6">
      <Carousel
        heading={
          <h2 className="text-[19px] font-semibold tracking-tight">
            {data.mode === "country" ? `Other places in ${country}` : "More stays nearby"}
          </h2>
        }
        itemClassName="basis-full sm:basis-1/2 lg:basis-1/3"
      >
        {data.items.map((property) => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </Carousel>
    </div>
  );
}
