"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ChevronDown, SlidersHorizontal, Search } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { PropertyCard } from "@/components/property/property-card";
import { SearchPill, type DetectedLocation, type SearchPillHandle } from "@/components/search/search-pill";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  propertyApi,
  type PropertyQuery,
  type PropertySort,
  type PropertyType,
} from "@/lib/api/properties";
import { queryKeys } from "@/lib/query/keys";

const PAGE_SIZE = 12;

const TYPES: { value: PropertyType; label: string }[] = [
  { value: "HOUSE", label: "House" },
  { value: "APARTMENT", label: "Apartment" },
  { value: "HOTEL_ROOM", label: "Hotel room" },
  { value: "MEETING_ROOM", label: "Meeting room" },
];

const AMENITIES: { value: string; label: string }[] = [
  { value: "WIFI", label: "Wifi" },
  { value: "KITCHEN", label: "Kitchen" },
  { value: "PARKING", label: "Free parking" },
  { value: "POOL", label: "Pool" },
  { value: "AIR_CONDITIONING", label: "Air conditioning" },
  { value: "PET_FRIENDLY", label: "Pet friendly" },
  { value: "TV", label: "TV" },
  { value: "WASHER", label: "Washer" },
];

const SORTS: { value: PropertySort; label: string }[] = [
  { value: "newest", label: "Recommended" },
  { value: "price_asc", label: "Price: low to high" },
  { value: "price_desc", label: "Price: high to low" },
];

function parseNumber(value: string | null): number | undefined {
  if (!value) return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function parseFilters(params: URLSearchParams): PropertyQuery {
  const amenities = params.get("amenities");
  return {
    city: params.get("city") ?? undefined,
    country: params.get("country") ?? undefined,
    district: params.get("district") ?? undefined,
    type: (params.get("type") as PropertyType | null) ?? undefined,
    minPrice: parseNumber(params.get("minPrice")),
    maxPrice: parseNumber(params.get("maxPrice")),
    maxGuests: parseNumber(params.get("maxGuests")),
    petsAllowed: params.get("petsAllowed") === "true" ? true : undefined,
    infantsAllowed: params.get("infantsAllowed") === "true" ? true : undefined,
    amenities: amenities ? amenities.split(",") : undefined,
    sort: (params.get("sort") as PropertySort | null) ?? "newest",
    checkIn: params.get("checkIn") ?? undefined,
    checkOut: params.get("checkOut") ?? undefined,
  };
}

export function BrowseView({ detected }: { detected?: DetectedLocation }) {
  return (
    <React.Suspense
      fallback={
        <div className="flex flex-1 flex-col">
          <SiteHeader />
          <main className="mx-auto w-full max-w-[1180px] px-6 pt-6">
            <ResultsSkeleton />
          </main>
        </div>
      }
    >
      <BrowseResults detected={detected} />
    </React.Suspense>
  );
}

function BrowseResults({ detected }: { detected?: DetectedLocation }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const searchPillRef = React.useRef<SearchPillHandle>(null);
  const filters = React.useMemo(
    () => parseFilters(new URLSearchParams(searchParams.toString())),
    [searchParams],
  );

  const [panelOpen, setPanelOpen] = React.useState(false);
  const [geoDismissed, setGeoDismissed] = React.useState(false);

  React.useEffect(() => {
    setGeoDismissed(sessionStorage.getItem("geo-dismissed") === "1");
  }, []);

  const locationsQuery = useQuery({
    queryKey: queryKeys.properties.locations,
    queryFn: propertyApi.locations,
    staleTime: 5 * 60 * 1000,
  });

  const hasExplicitLocation = Boolean(filters.city || filters.country || filters.district);

  // Detection only ever supplies a rendering-time default — it must never
  // overwrite explicit URL params, and is never written back to the URL.
  const detectedMatch = React.useMemo(() => {
    if (hasExplicitLocation || geoDismissed || !detected?.city) return undefined;
    const target = detected.city.toLowerCase();
    // Same-named cities in different countries: the detected country wins,
    // city-only match is only a fallback when the country didn't resolve.
    let fallback: { city: string; country: string } | undefined;
    for (const country of locationsQuery.data ?? []) {
      for (const city of country.cities) {
        if (city.city.toLowerCase() !== target) continue;
        if (detected.country && country.country === detected.country) {
          return { city: city.city, country: country.country };
        }
        fallback ??= { city: city.city, country: country.country };
      }
    }
    return detected.country ? undefined : fallback;
  }, [hasExplicitLocation, geoDismissed, detected?.city, detected?.country, locationsQuery.data]);

  const effectiveFilters = detectedMatch
    ? { ...filters, city: detectedMatch.city, country: detectedMatch.country }
    : filters;

  const query = useInfiniteQuery({
    queryKey: queryKeys.properties.browse(effectiveFilters),
    queryFn: ({ pageParam }) =>
      propertyApi.search({ ...effectiveFilters, page: pageParam, limit: PAGE_SIZE }),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const page = last.pagination.page ?? 1;
      const totalPages = last.pagination.totalPages ?? page;
      return page < totalPages ? page + 1 : undefined;
    },
  });

  const items = query.data?.pages.flatMap((p) => p.data) ?? [];
  const total = query.data?.pages[0]?.pagination.total ?? 0;

  function applyFilters(next: PropertyQuery) {
    const params = new URLSearchParams();
    if (next.city) params.set("city", next.city);
    if (next.country) params.set("country", next.country);
    if (next.district) params.set("district", next.district);
    if (next.type) params.set("type", next.type);
    if (next.minPrice) params.set("minPrice", String(next.minPrice));
    if (next.maxPrice) params.set("maxPrice", String(next.maxPrice));
    if (next.maxGuests) params.set("maxGuests", String(next.maxGuests));
    if (next.petsAllowed) params.set("petsAllowed", "true");
    if (next.infantsAllowed) params.set("infantsAllowed", "true");
    if (next.amenities?.length) params.set("amenities", next.amenities.join(","));
    if (next.sort && next.sort !== "newest") params.set("sort", next.sort);
    if (next.checkIn && next.checkOut) {
      params.set("checkIn", next.checkIn);
      params.set("checkOut", next.checkOut);
    }
    const qs = params.toString();
    router.push(qs ? `/browse?${qs}` : "/browse");
  }

  const activeFilterCount =
    (filters.type ? 1 : 0) +
    (filters.minPrice || filters.maxPrice ? 1 : 0) +
    (filters.maxGuests ? 1 : 0) +
    (filters.petsAllowed ? 1 : 0) +
    (filters.infantsAllowed ? 1 : 0) +
    (filters.amenities?.length ?? 0) +
    (filters.country || filters.city || filters.district ? 1 : 0);

  const locationLabel = effectiveFilters.district
    ? `${effectiveFilters.district}, ${effectiveFilters.city}`
    : effectiveFilters.city;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1180px] px-6 pt-6">
        <div className="mb-5">
          <SearchPill ref={searchPillRef} detected={detected} initialFilters={filters} />
        </div>

        {detectedMatch ? (
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-muted/40 px-4 py-2.5 text-sm">
            <span>
              Showing stays in {detectedMatch.city} — based on your location
            </span>
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={() => searchPillRef.current?.openWhere()}
                className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Change
              </button>
              <button
                type="button"
                onClick={() => {
                  sessionStorage.setItem("geo-dismissed", "1");
                  setGeoDismissed(true);
                }}
                className="text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Show all
              </button>
            </div>
          </div>
        ) : null}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <h1 className="text-lg font-semibold tracking-tight">
            {query.isPending
              ? "Searching…"
              : `${total} ${total === 1 ? "stay" : "stays"}${
                  locationLabel ? ` in ${locationLabel}` : ""
                }`}
          </h1>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPanelOpen((v) => !v)}
              aria-expanded={panelOpen}
            >
              <SlidersHorizontal />
              Filters
              {activeFilterCount > 0 ? (
                <span className="ml-1 inline-flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-primary px-1.5 font-mono text-[10px] font-semibold text-primary-foreground">
                  {activeFilterCount}
                </span>
              ) : null}
            </Button>
            <label className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <span className="font-mono text-[11px] tracking-wide uppercase">Sort</span>
              <span className="relative inline-flex items-center">
                <select
                  value={filters.sort}
                  onChange={(e) =>
                    applyFilters({ ...filters, sort: e.target.value as PropertySort })
                  }
                  className="cursor-pointer appearance-none rounded-lg border border-border bg-background py-1.5 pr-7 pl-3 text-sm text-foreground outline-none"
                >
                  {SORTS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <ChevronDown className="pointer-events-none absolute right-2 size-[15px] text-muted-foreground" />
              </span>
            </label>
          </div>
        </div>

        {panelOpen ? (
          <FilterPanel
            filters={filters}
            onApply={(next) => {
              applyFilters(next);
              setPanelOpen(false);
            }}
            onClear={() => {
              applyFilters({ sort: filters.sort });
              setPanelOpen(false);
            }}
          />
        ) : null}

        {query.isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-destructive">{(query.error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={() => query.refetch()}>
              Try again
            </Button>
          </div>
        ) : query.isPending ? (
          <ResultsSkeleton />
        ) : items.length === 0 ? (
          <EmptyState onClear={() => applyFilters({ sort: filters.sort })} />
        ) : (
          <>
            <section className="grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-6">
              {items.map((property) => (
                <PropertyCard key={property.id} property={property} />
              ))}
            </section>

            <div className="flex justify-center py-9">
              {query.hasNextPage ? (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => query.fetchNextPage()}
                  disabled={query.isFetchingNextPage}
                >
                  {query.isFetchingNextPage ? "Loading…" : "Show more stays"}
                </Button>
              ) : (
                <div className="flex flex-col items-center gap-1 text-center text-muted-foreground">
                  <div className="mb-2 h-px w-8 bg-border" />
                  <div className="text-sm font-medium text-foreground">
                    You&apos;ve reached the end
                  </div>
                  <div className="text-[13px]">Showing all {total} stays</div>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
}

function FilterPanel({
  filters,
  onApply,
  onClear,
}: {
  filters: PropertyQuery;
  onApply: (next: PropertyQuery) => void;
  onClear: () => void;
}) {
  const [type, setType] = React.useState<PropertyType | undefined>(filters.type);
  const [minPrice, setMinPrice] = React.useState(filters.minPrice?.toString() ?? "");
  const [maxPrice, setMaxPrice] = React.useState(filters.maxPrice?.toString() ?? "");
  const [maxGuests, setMaxGuests] = React.useState(filters.maxGuests?.toString() ?? "");
  const [amenities, setAmenities] = React.useState<string[]>(filters.amenities ?? []);
  const [petsAllowed, setPetsAllowed] = React.useState(Boolean(filters.petsAllowed));
  const [infantsAllowed, setInfantsAllowed] = React.useState(Boolean(filters.infantsAllowed));
  const [country, setCountry] = React.useState(filters.country ?? "all");
  const [city, setCity] = React.useState(filters.city ?? "all");
  const [district, setDistrict] = React.useState(filters.district ?? "all");

  const locationsQuery = useQuery({
    queryKey: queryKeys.properties.locations,
    queryFn: propertyApi.locations,
    staleTime: 5 * 60 * 1000,
  });
  const locations = locationsQuery.data ?? [];

  const countryOptions = locations.map((c) => ({ value: c.country, count: c.count }));
  const cityOptions =
    country !== "all"
      ? (locations.find((c) => c.country === country)?.cities ?? []).map((c) => ({
          value: c.city,
          count: c.count,
        }))
      : [];
  const districtOptions =
    country !== "all" && city !== "all"
      ? (
          locations.find((c) => c.country === country)?.cities.find((c) => c.city === city)
            ?.districts ?? []
        ).map((d) => ({ value: d.district, count: d.count }))
      : [];

  function toggleAmenity(value: string) {
    setAmenities((prev) =>
      prev.includes(value) ? prev.filter((a) => a !== value) : [...prev, value],
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-border bg-card p-5">
      <div className="mb-6 border-b border-border pb-6">
        <div className="mb-2.5 text-[13px] font-medium">Location</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Select
            value={country}
            onValueChange={(v) => {
              setCountry(v ?? "all");
              setCity("all");
              setDistrict("all");
            }}
          >
            <SelectTrigger className="w-full" aria-label="Country">
              <SelectValue placeholder="Country" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All countries</SelectItem>
              {countryOptions.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.value} ({c.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={city}
            onValueChange={(v) => {
              setCity(v ?? "all");
              setDistrict("all");
            }}
            disabled={country === "all"}
          >
            <SelectTrigger className="w-full" aria-label="City">
              <SelectValue placeholder="City" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All cities</SelectItem>
              {cityOptions.map((c) => (
                <SelectItem key={c.value} value={c.value}>
                  {c.value} ({c.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={district}
            onValueChange={(v) => setDistrict(v ?? "all")}
            disabled={city === "all"}
          >
            <SelectTrigger className="w-full" aria-label="District">
              <SelectValue placeholder="District" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All districts</SelectItem>
              {districtOptions.map((d) => (
                <SelectItem key={d.value} value={d.value}>
                  {d.value} ({d.count})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <Label className="text-[13px] font-medium" id="price-range-label">
            Price per night
          </Label>
          <div className="mt-2.5 flex items-center gap-2" role="group" aria-labelledby="price-range-label">
            <Input
              type="number"
              min={0}
              placeholder="$50"
              aria-label="Minimum price per night"
              value={minPrice}
              onChange={(e) => setMinPrice(e.target.value)}
            />
            <span className="text-muted-foreground">–</span>
            <Input
              type="number"
              min={0}
              placeholder="$600"
              aria-label="Maximum price per night"
              value={maxPrice}
              onChange={(e) => setMaxPrice(e.target.value)}
            />
          </div>
        </div>

        <div>
          <Label className="text-[13px] font-medium" htmlFor="max-guests">
            Guests
          </Label>
          <Input
            id="max-guests"
            type="number"
            min={1}
            placeholder="Any"
            value={maxGuests}
            onChange={(e) => setMaxGuests(e.target.value)}
            className="mt-2.5"
          />
        </div>

        <div>
          <div className="mb-2.5 text-[13px] font-medium">Property type</div>
          <div className="flex flex-col gap-1.5">
            {TYPES.map((t) => (
              <label key={t.value} className="flex items-center gap-2.5 text-sm">
                <input
                  type="radio"
                  name="property-type"
                  className="size-4 accent-primary"
                  checked={type === t.value}
                  onChange={() => setType(t.value)}
                />
                {t.label}
              </label>
            ))}
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="radio"
                name="property-type"
                className="size-4 accent-primary"
                checked={!type}
                onChange={() => setType(undefined)}
              />
              Any
            </label>
          </div>
        </div>

        <div>
          <div className="mb-2.5 text-[13px] font-medium">Amenities</div>
          <div className="flex flex-col gap-1.5">
            {AMENITIES.map((a) => (
              <label key={a.value} className="flex items-center gap-2.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={amenities.includes(a.value)}
                  onChange={() => toggleAmenity(a.value)}
                />
                {a.label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="mt-6 border-t border-border pt-5">
        <div className="mb-2.5 text-[13px] font-medium">House rules</div>
        <div className="flex flex-col gap-3 sm:flex-row sm:gap-8">
          <label className="flex items-center gap-2.5 text-sm">
            <Switch checked={petsAllowed} onCheckedChange={setPetsAllowed} />
            Pets allowed
          </label>
          <label className="flex items-center gap-2.5 text-sm">
            <Switch checked={infantsAllowed} onCheckedChange={setInfantsAllowed} />
            Suitable for infants
          </label>
        </div>
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 border-t border-border pt-4">
        <button
          type="button"
          onClick={onClear}
          className="text-[13px] text-muted-foreground underline underline-offset-2"
        >
          Clear all
        </button>
        <Button
          size="sm"
          onClick={() =>
            onApply({
              ...filters,
              type,
              country: country !== "all" ? country : undefined,
              city: city !== "all" ? city : undefined,
              district: district !== "all" ? district : undefined,
              minPrice: minPrice ? Number(minPrice) : undefined,
              maxPrice: maxPrice ? Number(maxPrice) : undefined,
              maxGuests: maxGuests ? Number(maxGuests) : undefined,
              petsAllowed: petsAllowed || undefined,
              infantsAllowed: infantsAllowed || undefined,
              amenities: amenities.length ? amenities : undefined,
            })
          }
        >
          <Search />
          Apply filters
        </Button>
      </div>
    </div>
  );
}

function ResultsSkeleton() {
  return (
    <section className="grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-6">
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="overflow-hidden rounded-xl border border-border">
          <div className="aspect-square animate-pulse bg-muted" />
          <div className="flex flex-col gap-2 px-4 pt-3 pb-4">
            <div className="h-3 w-2/3 animate-pulse rounded bg-muted" />
            <div className="h-2.5 w-2/5 animate-pulse rounded bg-muted" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-muted" />
          </div>
        </div>
      ))}
    </section>
  );
}

function EmptyState({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border px-6 py-18 text-center">
      <div className="mb-4 flex size-13 items-center justify-center rounded-full border border-border text-muted-foreground">
        <Search className="size-5" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">No stays match your filters</h2>
      <p className="mt-1.5 max-w-[340px] text-sm text-muted-foreground text-pretty">
        Try widening your price range or removing a few amenities to see more places.
      </p>
      <Button variant="outline" size="sm" className="mt-5" onClick={onClear}>
        Clear filters
      </Button>
    </div>
  );
}
