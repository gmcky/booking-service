"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { MapPin, Search, Users, Navigation, Minus, Plus, CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { propertyApi, type LocationCountry, type PropertyQuery } from "@/lib/api/properties";
import { queryKeys } from "@/lib/query/keys";
import { formatRange, isoToLocalDate, toISODate } from "@/lib/utils/dates";
import { cn } from "@/lib/utils";

/** Sane upper bound on adults + children so the steppers can't run away. */
const MAX_GUESTS = 16;

export interface LocationSelection {
  country?: string;
  city?: string;
  district?: string;
}

export interface DetectedLocation {
  country?: string;
  city?: string;
}

export interface SearchPillHandle {
  openWhere: () => void;
}

export interface SearchPillProps {
  /** Geo-detected location (server-derived) used to surface a "Nearby" shortcut. */
  detected?: DetectedLocation;
  /** Seed the pill's fields from the current URL filters (used on /browse). */
  initialFilters?: PropertyQuery;
  className?: string;
}

function clampAdults(adults: number, children: number, infants: boolean): number {
  const min = children > 0 || infants ? 1 : 0;
  const max = Math.max(min, MAX_GUESTS - children);
  return Math.min(max, Math.max(min, adults));
}

function clampChildren(children: number, adults: number): number {
  return Math.min(Math.max(0, children), Math.max(0, MAX_GUESTS - adults));
}

function whereLabel(selection: LocationSelection): string | undefined {
  if (selection.district) return `${selection.city} · ${selection.district}`;
  if (selection.city) return selection.city;
  if (selection.country) return selection.country;
  return undefined;
}

function matchesQuery(value: string, query: string): boolean {
  return value.toLowerCase().includes(query);
}

function filterLocations(locations: LocationCountry[], query: string): LocationCountry[] {
  const q = query.trim().toLowerCase();
  if (!q) return locations;
  return locations
    .map((country) => {
      const countryMatches = matchesQuery(country.country, q);
      const cities = country.cities
        .map((city) => {
          const cityMatches = countryMatches || matchesQuery(city.city, q);
          const districts = city.districts.filter((d) => matchesQuery(d.district, q));
          if (cityMatches || districts.length > 0) {
            return cityMatches ? city : { ...city, districts };
          }
          return null;
        })
        .filter((c): c is LocationCountry["cities"][number] => c !== null);
      return cities.length > 0 ? { ...country, cities } : null;
    })
    .filter((c): c is LocationCountry => c !== null);
}

export const SearchPill = React.forwardRef<SearchPillHandle, SearchPillProps>(
  function SearchPill({ detected, initialFilters, className }, ref) {
    const router = useRouter();

    const [whereOpen, setWhereOpen] = React.useState(false);
    const [whenOpen, setWhenOpen] = React.useState(false);
    const [whoOpen, setWhoOpen] = React.useState(false);

    const [whereQuery, setWhereQuery] = React.useState("");
    const [selection, setSelection] = React.useState<LocationSelection>({
      country: initialFilters?.country,
      city: initialFilters?.city,
      district: initialFilters?.district,
    });

    const [range, setRange] = React.useState<DateRange | undefined>(() =>
      initialFilters?.checkIn && initialFilters?.checkOut
        ? {
            from: isoToLocalDate(initialFilters.checkIn),
            to: isoToLocalDate(initialFilters.checkOut),
          }
        : undefined,
    );

    // The URL only ever carries a single aggregate `maxGuests` count (no
    // adults/children/infants breakdown), so a rehydrated total is attributed
    // entirely to adults — the closest lossless reconstruction available.
    const [adults, setAdults] = React.useState(initialFilters?.maxGuests ?? 0);
    const [children, setChildren] = React.useState(0);
    const [infants, setInfants] = React.useState(Boolean(initialFilters?.infantsAllowed));
    const [pets, setPets] = React.useState(Boolean(initialFilters?.petsAllowed));

    // Adults must never sit at 0 while children/infants are present — clamp
    // whenever either changes (covers both stepper clicks and initial props).
    React.useEffect(() => {
      setAdults((a) => clampAdults(a, children, infants));
    }, [children, infants]);

    React.useImperativeHandle(ref, () => ({
      openWhere: () => setWhereOpen(true),
    }));

    const locationsQuery = useQuery({
      queryKey: queryKeys.properties.locations,
      queryFn: propertyApi.locations,
      staleTime: 5 * 60 * 1000,
    });

    const locations = locationsQuery.data ?? [];
    const filteredLocations = React.useMemo(
      () => filterLocations(locations, whereQuery),
      [locations, whereQuery],
    );

    function selectCity(country: string, city: string, districtCount: number) {
      setSelection({ country, city, district: undefined });
      if (districtCount === 0) setWhereOpen(false);
    }

    function selectDistrict(country: string, city: string, district: string) {
      setSelection({ country, city, district });
      setWhereOpen(false);
    }

    // "Nearby" is only offered when the detected city resolves against the
    // real locations tree — the country label from the ISO map may not match
    // host-entered free text, and an unresolved pair would search into zero
    // results. Detected country wins on same-named cities; city-only match
    // is the fallback when the country didn't resolve.
    const resolvedNearby = React.useMemo(() => {
      if (!detected?.city) return undefined;
      const target = detected.city.toLowerCase();
      let fallback: { country: string; city: string } | undefined;
      for (const country of locations) {
        for (const city of country.cities) {
          if (city.city.toLowerCase() !== target) continue;
          if (detected.country && country.country === detected.country) {
            return { country: country.country, city: city.city };
          }
          fallback ??= { country: country.country, city: city.city };
        }
      }
      return detected.country ? undefined : fallback;
    }, [detected?.city, detected?.country, locations]);

    function selectNearby() {
      if (!resolvedNearby) return;
      setSelection({ ...resolvedNearby, district: undefined });
      setWhereOpen(false);
    }

    const guestsTotal = adults + children;

    function onSearch() {
      const params = new URLSearchParams();
      if (selection.country) params.set("country", selection.country);
      if (selection.city) params.set("city", selection.city);
      if (selection.district) params.set("district", selection.district);

      const checkIn = toISODate(range?.from);
      const checkOut = toISODate(range?.to);
      if (checkIn && checkOut) {
        params.set("checkIn", checkIn);
        params.set("checkOut", checkOut);
      }

      // Note: the browse page's filter parsing only recognizes `maxGuests`
      // (matching the /properties API query param) — using a bare `guests`
      // key here would be silently dropped on landing.
      if (guestsTotal > 0) params.set("maxGuests", String(guestsTotal));
      // House-rule filters are one-directional (narrow to allowing listings)
      // — only ever sent as `true`, never `false`, matching the backend.
      if (pets) params.set("petsAllowed", "true");
      if (infants) params.set("infantsAllowed", "true");

      const qs = params.toString();
      router.push(qs ? `/browse?${qs}` : "/browse");
    }

    const whereText = whereLabel(selection);
    const whenText =
      range?.from && range?.to ? formatRange(toISODate(range.from)!, toISODate(range.to)!) : undefined;
    const whoText = (() => {
      const parts: string[] = [];
      if (guestsTotal > 0) parts.push(`${guestsTotal} guest${guestsTotal === 1 ? "" : "s"}`);
      const rules: string[] = [];
      if (pets) rules.push("pets");
      if (infants) rules.push("infants");
      if (rules.length > 0) parts.push(rules.join(" · "));
      return parts.length > 0 ? parts.join(" · ") : undefined;
    })();

    return (
      <div className={cn("rounded-full border border-border bg-card p-2.5 shadow-sm", className)}>
        <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-0">
          <Popover open={whereOpen} onOpenChange={setWhereOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="min-w-0 flex-[1.4] rounded-full px-4 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="mb-1 block font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                    Where
                  </span>
                  <span className="flex items-center gap-2">
                    <MapPin className="size-4 shrink-0 text-muted-foreground" />
                    <span
                      className={cn(
                        "truncate text-[15px]",
                        whereText ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {whereText ?? "Search destinations"}
                    </span>
                  </span>
                </button>
              }
            />
            <PopoverContent className="w-80 p-0" align="start">
              <div className="p-1.5 pb-1">
                <Input
                  value={whereQuery}
                  onChange={(e) => setWhereQuery(e.target.value)}
                  placeholder="Search destinations"
                  aria-label="Search destinations"
                  autoFocus
                />
              </div>
              <div className="max-h-80 overflow-y-auto px-1 pb-1">
                {resolvedNearby ? (
                  <button
                    type="button"
                    onClick={selectNearby}
                    className="flex w-full items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent"
                  >
                    <Navigation className="size-4 shrink-0 text-muted-foreground" />
                    <span>Nearby — {resolvedNearby.city}</span>
                  </button>
                ) : null}

                {locationsQuery.isPending ? (
                  <p className="px-2.5 py-3 text-center text-sm text-muted-foreground">Loading…</p>
                ) : filteredLocations.length === 0 ? (
                  <p className="px-2.5 py-3 text-center text-sm text-muted-foreground">
                    No destinations found
                  </p>
                ) : (
                  filteredLocations.map((country) => (
                    <div key={country.country}>
                      <div className="px-2.5 pt-2.5 pb-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                        {country.country}
                      </div>
                      {country.cities.map((city) => {
                        const active =
                          selection.country === country.country && selection.city === city.city;
                        return (
                          <div key={city.city}>
                            <button
                              type="button"
                              onClick={() =>
                                selectCity(country.country, city.city, city.districts.length)
                              }
                              className={cn(
                                "flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm hover:bg-accent",
                                active && "bg-accent",
                              )}
                            >
                              <span>
                                {city.city}, {country.country}
                              </span>
                              <span className="text-xs text-muted-foreground">{city.count}</span>
                            </button>
                            {active && city.districts.length > 0 ? (
                              <div className="mb-1 ml-4 flex flex-col gap-0.5 border-l border-border pl-2.5">
                                {city.districts.map((d) => (
                                  <button
                                    key={d.district}
                                    type="button"
                                    onClick={() =>
                                      selectDistrict(country.country, city.city, d.district)
                                    }
                                    className={cn(
                                      "flex items-center justify-between gap-2 rounded-md px-2 py-1 text-left text-[13px] hover:bg-accent",
                                      selection.district === d.district && "bg-accent",
                                    )}
                                  >
                                    <span>{d.district}</span>
                                    <span className="text-xs text-muted-foreground">{d.count}</span>
                                  </button>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>

          <Divider />

          <Popover open={whenOpen} onOpenChange={setWhenOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="min-w-0 flex-1 rounded-full px-4 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="mb-1 block font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                    When
                  </span>
                  <span className="flex items-center gap-2">
                    <CalendarIcon className="size-4 shrink-0 text-muted-foreground" />
                    <span
                      className={cn(
                        "truncate text-[15px]",
                        whenText ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {whenText ?? "Add dates"}
                    </span>
                  </span>
                </button>
              }
            />
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="range"
                selected={range}
                onSelect={setRange}
                numberOfMonths={2}
                defaultMonth={range?.from}
                autoFocus
              />
            </PopoverContent>
          </Popover>

          <Divider />

          <Popover open={whoOpen} onOpenChange={setWhoOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  className="min-w-0 flex-[0.9] rounded-full px-4 py-2 text-left transition-colors hover:bg-muted"
                >
                  <span className="mb-1 block font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
                    Who
                  </span>
                  <span className="flex items-center gap-2">
                    <Users className="size-4 shrink-0 text-muted-foreground" />
                    <span
                      className={cn(
                        "truncate text-[15px]",
                        whoText ? "text-foreground" : "text-muted-foreground",
                      )}
                    >
                      {whoText ?? "Add guests"}
                    </span>
                  </span>
                </button>
              }
            />
            <PopoverContent className="w-72" align="end">
              <GuestStepper
                label="Adults"
                hint="Ages 13+"
                value={adults}
                onChange={(v) => setAdults(clampAdults(v, children, infants))}
                min={children > 0 || infants ? 1 : 0}
                max={MAX_GUESTS - children}
              />
              <GuestStepper
                label="Children"
                hint="2–12"
                value={children}
                onChange={(v) => setChildren(clampChildren(v, adults))}
                max={MAX_GUESTS - adults}
              />
              <div className="my-1 h-px bg-border" />
              <GuestToggle
                label="Infants"
                hint="Under 2 — suitable stays only"
                checked={infants}
                onCheckedChange={setInfants}
              />
              <GuestToggle
                label="Pets"
                hint="Pet-friendly stays only"
                checked={pets}
                onCheckedChange={setPets}
              />
            </PopoverContent>
          </Popover>

          <div className="p-2">
            <Button size="lg" className="w-full rounded-full" onClick={onSearch}>
              <Search className="mr-1.5" />
              Search
            </Button>
          </div>
        </div>
      </div>
    );
  },
);

function Divider() {
  return <div className="my-2 hidden w-px self-stretch bg-border sm:block" />;
}

function GuestStepper({
  label,
  hint,
  value,
  onChange,
  min = 0,
  max = Infinity,
}: {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-1 last:pb-1">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      <div className="flex items-center overflow-hidden rounded-full border border-border">
        <button
          type="button"
          aria-label={`Decrease ${label.toLowerCase()}`}
          onClick={() => onChange(Math.max(min, value - 1))}
          disabled={value <= min}
          className="flex size-7 items-center justify-center disabled:opacity-40"
        >
          <Minus className="size-[13px]" />
        </button>
        <span className="min-w-6 text-center font-mono text-sm">{value}</span>
        <button
          type="button"
          aria-label={`Increase ${label.toLowerCase()}`}
          onClick={() => onChange(Math.min(max, value + 1))}
          disabled={value >= max}
          className="flex size-7 items-center justify-center disabled:opacity-40"
        >
          <Plus className="size-[13px]" />
        </button>
      </div>
    </div>
  );
}

function GuestToggle({
  label,
  hint,
  checked,
  onCheckedChange,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-2 first:pt-1 last:pb-1">
      <div>
        <div className="text-sm font-medium">{label}</div>
        {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} aria-label={label} />
    </div>
  );
}
