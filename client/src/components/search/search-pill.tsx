"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { addMonths, format, isSameMonth, startOfMonth } from "date-fns";
import {
  MapPin,
  Search,
  Users,
  Navigation,
  Minus,
  Plus,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { propertyApi, type LocationCountry, type PropertyQuery } from "@/lib/api/properties";
import { queryKeys } from "@/lib/query/keys";
import { isoToLocalDate, startOfToday, toISODate } from "@/lib/utils/dates";
import { extendStay, flexibleWindow, type FlexibleDuration } from "@/lib/utils/flexible-dates";
import { cn } from "@/lib/utils";

/** Sane upper bound on adults + children so the steppers can't run away. */
const MAX_GUESTS = 16;

type WhenTab = "dates" | "flexible";

/** Stay-length shortcuts (nights from check-in); 0 means "Exact dates". */
const FLEX_CHIP_DAYS = [0, 1, 2, 3, 7, 14] as const;
type ChipDays = (typeof FLEX_CHIP_DAYS)[number];

const DURATION_LABEL: Record<FlexibleDuration, string> = {
  weekend: "Weekend",
  week: "Week",
  month: "Month",
};

const STAY_LABEL: Record<FlexibleDuration, string> = {
  weekend: "a weekend",
  week: "a week",
  month: "a month",
};

type SegmentKey = "where" | "when" | "who";

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
  /**
   * Starts the pill collapsed into a compact single-row bar (browse page).
   * Clicking a segment expands to the full pill and opens that segment's
   * popover; the pill re-collapses after a search or an outside click made
   * while no popover is open.
   */
  collapsible?: boolean;
}

function clampAdults(adults: number, children: number, infants: boolean): number {
  const min = children > 0 || infants ? 1 : 0;
  const max = Math.max(min, MAX_GUESTS - children);
  return Math.min(max, Math.max(min, adults));
}

function clampChildren(children: number, adults: number): number {
  return Math.min(Math.max(0, children), Math.max(0, MAX_GUESTS - adults));
}

/** "Jul 10 – 24" (same month) / "Jul 28 – Aug 3" (spanning months). */
function formatDatesLabel(range: { from: Date; to: Date }): string {
  const sameMonth =
    range.from.getMonth() === range.to.getMonth() && range.from.getFullYear() === range.to.getFullYear();
  return `${format(range.from, "MMM d")} – ${format(range.to, sameMonth ? "d" : "MMM d")}`;
}

/** "August" / "Aug, Sep" — full name for one month, short names for several. */
function formatMonthsLabel(months: Date[], style: "short" | "long" = "short"): string {
  if (months.length === 1) return format(months[0], "MMMM");
  return months.map((m) => format(m, style === "long" && months.length <= 2 ? "MMMM" : "MMM")).join(", ");
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
  function SearchPill({ detected, initialFilters, className, collapsible }, ref) {
    const router = useRouter();

    const rootRef = React.useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = React.useState(!collapsible);

    const [whereOpen, setWhereOpen] = React.useState(false);
    const [whenOpen, setWhenOpen] = React.useState(false);
    const [whoOpen, setWhoOpen] = React.useState(false);

    function expandAndOpen(segment: SegmentKey) {
      setExpanded(true);
      if (segment === "where") setWhereOpen(true);
      else if (segment === "when") setWhenOpen(true);
      else setWhoOpen(true);
    }

    // Collapse back to the compact bar on an outside click, but only once no
    // popover is open — an outside click that's merely dismissing a popover
    // (e.g. base-ui's own outside-click handling) shouldn't also collapse
    // the pill in the same gesture.
    React.useEffect(() => {
      if (!collapsible || !expanded || whereOpen || whenOpen || whoOpen) return;
      function handlePointerDown(e: PointerEvent) {
        if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
          setExpanded(false);
        }
      }
      document.addEventListener("pointerdown", handlePointerDown);
      return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [collapsible, expanded, whereOpen, whenOpen, whoOpen]);

    const activeSegment: SegmentKey | null = whereOpen
      ? "where"
      : whenOpen
        ? "when"
        : whoOpen
          ? "who"
          : null;

    // Sliding highlight behind the active segment. Measured from the live
    // DOM (rather than fixed fractions) because the three segments have
    // different flex weights and the layout switches to a column on mobile.
    // Positioned against the pill container (padding included) so the thumb
    // fills the pill's full height in the horizontal layout; the stacked
    // mobile layout keeps a per-segment thumb.
    const pillRef = React.useRef<HTMLDivElement>(null);
    const rowRef = React.useRef<HTMLDivElement>(null);
    const [thumb, setThumb] = React.useState<{
      left: number;
      top: number;
      width: number;
      height: number;
    } | null>(null);
    const [thumbVisible, setThumbVisible] = React.useState(false);

    React.useLayoutEffect(() => {
      if (!activeSegment) {
        // Grace period: switching segments closes one popover a beat before
        // the next opens — without it the thumb blinks instead of sliding.
        const timer = window.setTimeout(() => setThumbVisible(false), 100);
        return () => window.clearTimeout(timer);
      }
      const measure = () => {
        const pill = pillRef.current;
        const row = rowRef.current;
        const el = row?.querySelector<HTMLElement>(`[data-segment="${activeSegment}"]`);
        if (!pill || !row || !el) return;
        const pillRect = pill.getBoundingClientRect();
        const rect = el.getBoundingClientRect();
        const horizontal = getComputedStyle(row).flexDirection === "row";
        setThumb({
          left: rect.left - pillRect.left,
          top: horizontal ? 0 : rect.top - pillRect.top,
          width: rect.width,
          height: horizontal ? pillRect.height : rect.height,
        });
        setThumbVisible(true);
      };
      measure();
      window.addEventListener("resize", measure);
      return () => window.removeEventListener("resize", measure);
    }, [activeSegment]);

    // Popovers anchor to the whole pill (Where left, When centered, Who
    // right — Airbnb layout) only while the segments sit in one row; in the
    // stacked mobile layout each popover must follow its own trigger or it
    // renders detached below the whole stack.
    const [rowLayout, setRowLayout] = React.useState(false);
    React.useEffect(() => {
      const mq = window.matchMedia("(min-width: 640px)");
      const update = () => setRowLayout(mq.matches);
      update();
      mq.addEventListener("change", update);
      return () => mq.removeEventListener("change", update);
    }, []);
    const pillAnchor = rowLayout ? pillRef : undefined;

    const [whereQuery, setWhereQuery] = React.useState("");
    const [selection, setSelection] = React.useState<LocationSelection>({
      country: initialFilters?.country,
      city: initialFilters?.city,
      district: initialFilters?.district,
    });

    // Recomputed each time the When popover opens so a tab left open across
    // midnight can't keep treating yesterday as a selectable "today".
    const [today, setToday] = React.useState(() => startOfToday());
    React.useEffect(() => {
      if (!whenOpen) return;
      setToday((prev) => {
        const next = startOfToday();
        return prev.getTime() === next.getTime() ? prev : next;
      });
    }, [whenOpen]);

    // `base` is what the user actually picked on the calendar. The duration
    // chips derive the submitted range from `base.from` only (+N nights), so
    // +7 -> +14 replaces the checkout instead of compounding. Re-picking on
    // the calendar resets the chip to "Exact dates".
    const [base, setBase] = React.useState<DateRange | undefined>(() =>
      initialFilters?.checkIn && initialFilters?.checkOut
        ? {
            from: isoToLocalDate(initialFilters.checkIn),
            to: isoToLocalDate(initialFilters.checkOut),
          }
        : undefined,
    );
    const [chipDays, setChipDays] = React.useState<ChipDays>(0);

    const [whenTab, setWhenTab] = React.useState<WhenTab>("dates");
    const [flexDuration, setFlexDuration] = React.useState<FlexibleDuration>("weekend");
    // Multiple months are an expressed preference (they all show in the
    // label), but the searched window anchors to the earliest one — the
    // backend takes a single exact range, so a real "any of these months"
    // OR-search isn't possible (same simplification as flexibleWindow).
    const [flexMonthsSelected, setFlexMonthsSelected] = React.useState<Date[]>([]);
    const flexMonthsScrollRef = React.useRef<HTMLDivElement>(null);

    function toggleFlexMonth(month: Date) {
      setFlexMonthsSelected((prev) => {
        const exists = prev.some((m) => isSameMonth(m, month));
        const next = exists
          ? prev.filter((m) => !isSameMonth(m, month))
          : [...prev, month];
        return next.sort((a, b) => a.getTime() - b.getTime());
      });
    }

    const range = React.useMemo(
      () => (base?.from && chipDays > 0 ? extendStay(base.from, chipDays) : base),
      [base, chipDays],
    );

    function onCalendarSelect(next?: DateRange) {
      setBase(next);
      setChipDays(0);
    }

    const flexMonths = React.useMemo(() => {
      const start = startOfMonth(today);
      return Array.from({ length: 12 }, (_, i) => addMonths(start, i));
    }, [today]);

    function scrollFlexMonths(direction: -1 | 1) {
      // Three cards per click: card width (112) + gap (12).
      flexMonthsScrollRef.current?.scrollBy({ left: direction * 372, behavior: "smooth" });
    }

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
      openWhere: () => {
        setExpanded(true);
        setWhereOpen(true);
      },
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

    // Computed once here (rather than inline in both onSearch and the label)
    // so the "whichever tab is active wins" rule reads the same window in
    // both places.
    const flexWindow = React.useMemo(
      () =>
        flexMonthsSelected.length > 0
          ? flexibleWindow(flexMonthsSelected[0], flexDuration, today)
          : undefined,
      [flexMonthsSelected, flexDuration, today],
    );

    function onSearch() {
      const params = new URLSearchParams();
      if (selection.country) params.set("country", selection.country);
      if (selection.city) params.set("city", selection.city);
      if (selection.district) params.set("district", selection.district);

      const checkIn =
        whenTab === "flexible"
          ? toISODate(flexWindow?.checkIn)
          : toISODate(range?.from);
      const checkOut =
        whenTab === "flexible"
          ? toISODate(flexWindow?.checkOut)
          : toISODate(range?.to);
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
      if (collapsible) setExpanded(false);
    }

    const whereText = whereLabel(selection);
    const whenText =
      whenTab === "flexible"
        ? flexMonthsSelected.length > 0
          ? `${DURATION_LABEL[flexDuration]} in ${formatMonthsLabel(flexMonthsSelected)}`
          : undefined
        : range?.from && range?.to
          ? formatDatesLabel(range as { from: Date; to: Date })
          : undefined;
    const whoText = (() => {
      const parts: string[] = [];
      if (guestsTotal > 0) parts.push(`${guestsTotal} guest${guestsTotal === 1 ? "" : "s"}`);
      const rules: string[] = [];
      if (pets) rules.push("pets");
      if (infants) rules.push("infants");
      if (rules.length > 0) parts.push(rules.join(" · "));
      return parts.length > 0 ? parts.join(" · ") : undefined;
    })();

    if (collapsible && !expanded) {
      return (
        <div ref={rootRef}>
          <div
            key="compact"
            className={cn(
              "flex h-12 items-center justify-center gap-1 rounded-full border border-border bg-card px-2 shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200 motion-reduce:transition-none",
              className,
            )}
          >
            <button
              type="button"
              onClick={() => expandAndOpen("where")}
              className="min-w-0 flex-1 truncate rounded-full px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              <span className={whereText ? "text-foreground" : "text-muted-foreground"}>
                {whereText ?? "Anywhere"}
              </span>
            </button>
            <div className="h-5 w-px shrink-0 bg-border" />
            <button
              type="button"
              onClick={() => expandAndOpen("when")}
              className="min-w-0 flex-1 truncate rounded-full px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              <span className={whenText ? "text-foreground" : "text-muted-foreground"}>
                {whenText ?? "Anytime"}
              </span>
            </button>
            <div className="h-5 w-px shrink-0 bg-border" />
            <button
              type="button"
              onClick={() => expandAndOpen("who")}
              className="min-w-0 flex-1 truncate rounded-full px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              <span className={whoText ? "text-foreground" : "text-muted-foreground"}>
                {whoText ?? "Add guests"}
              </span>
            </button>
            <button
              type="button"
              aria-label="Search"
              onClick={() => setExpanded(true)}
              className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/80"
            >
              <Search className="size-4" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div ref={rootRef}>
        <div
          key="expanded"
          ref={pillRef}
          className={cn(
            "relative rounded-full border border-border p-2.5 shadow-sm transition-colors duration-300",
            activeSegment ? "bg-muted" : "bg-card",
            collapsible &&
              "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200 motion-reduce:transition-none",
            className,
          )}
        >
          {thumb ? (
            <div
              aria-hidden
              className={cn(
                "pointer-events-none absolute z-0 rounded-full bg-card shadow-md ring-1 ring-foreground/5 transition-all duration-300 ease-out motion-reduce:transition-none",
                thumbVisible ? "opacity-100" : "opacity-0",
              )}
              style={{
                left: thumb.left,
                top: thumb.top,
                width: thumb.width,
                height: thumb.height,
              }}
            />
          ) : null}
          <div
            ref={rowRef}
            className="relative flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:gap-0"
          >
          <Popover open={whereOpen} onOpenChange={setWhereOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  data-segment="where"
                  className="relative z-10 min-w-0 flex-[1.4] rounded-full px-4 py-2 text-left transition-colors hover:bg-muted"
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
            <PopoverContent className="w-80 p-0" align="start" anchor={pillAnchor}>
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

          <Divider faded={activeSegment !== null} />

          <Popover open={whenOpen} onOpenChange={setWhenOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  data-segment="when"
                  className="relative z-10 min-w-0 flex-1 rounded-full px-4 py-2 text-left transition-colors hover:bg-muted"
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
            <PopoverContent className="w-auto p-0" align="center" anchor={pillAnchor}>
              <div className="flex justify-center px-4 pt-4">
                <div className="relative grid w-60 grid-cols-2 rounded-full bg-muted p-1">
                  <div
                    aria-hidden
                    className={cn(
                      "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-background shadow-sm ring-1 ring-foreground/10 transition-transform duration-200 ease-out motion-reduce:transition-none",
                      whenTab === "flexible" && "translate-x-full",
                    )}
                  />
                  <WhenTabButton active={whenTab === "dates"} onClick={() => setWhenTab("dates")}>
                    Dates
                  </WhenTabButton>
                  <WhenTabButton
                    active={whenTab === "flexible"}
                    onClick={() => setWhenTab("flexible")}
                  >
                    Flexible
                  </WhenTabButton>
                </div>
              </div>

              <PanelResize>
                {whenTab === "dates" ? (
                  <div
                    key="dates"
                    className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
                  >
                    <Calendar
                      mode="range"
                      selected={range}
                      onSelect={onCalendarSelect}
                      numberOfMonths={2}
                      defaultMonth={base?.from}
                      disabled={{ before: today }}
                      showOutsideDays={false}
                      autoFocus
                    />
                    <div className="flex flex-wrap gap-1.5 border-t border-border p-3 pt-2.5">
                      {FLEX_CHIP_DAYS.map((days) => (
                        <RangeChip
                          key={days}
                          active={chipDays === days}
                          disabled={!base?.from}
                          onClick={() => setChipDays(days)}
                        >
                          {days === 0 ? "Exact dates" : `+ ${days} day${days === 1 ? "" : "s"}`}
                        </RangeChip>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div
                    key="flexible"
                    className="flex w-[640px] max-w-[92vw] flex-col items-center gap-6 px-6 pt-2 pb-7 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200"
                  >
                    <div className="flex flex-col items-center gap-3.5">
                      <h3 className="text-lg font-semibold tracking-tight">
                        Stay for {STAY_LABEL[flexDuration]}
                      </h3>
                      <div className="flex flex-wrap justify-center gap-2.5">
                        {(Object.keys(DURATION_LABEL) as FlexibleDuration[]).map((duration) => (
                          <button
                            key={duration}
                            type="button"
                            onClick={() => setFlexDuration(duration)}
                            className={cn(
                              "rounded-full border px-5 py-2 text-sm font-medium transition-[border-color,box-shadow] motion-safe:duration-[180ms] motion-safe:ease-out motion-reduce:transition-none",
                              flexDuration === duration
                                ? "border-foreground ring-1 ring-inset ring-foreground"
                                : "border-border hover:border-foreground/50",
                            )}
                          >
                            {DURATION_LABEL[duration]}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex w-full flex-col items-center gap-3.5">
                      <h3 className="text-lg font-semibold tracking-tight">
                        {flexMonthsSelected.length > 0
                          ? `Go in ${formatMonthsLabel(flexMonthsSelected, "long")}`
                          : "Go anytime"}
                      </h3>
                      <div className="relative w-full">
                        <div
                          ref={flexMonthsScrollRef}
                          className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
                        >
                          {flexMonths.map((month) => (
                            <MonthCard
                              key={month.toISOString()}
                              month={month}
                              active={flexMonthsSelected.some((m) => isSameMonth(m, month))}
                              onClick={() => toggleFlexMonth(month)}
                            />
                          ))}
                        </div>
                        <button
                          type="button"
                          aria-label="Scroll months left"
                          onClick={() => scrollFlexMonths(-1)}
                          className="absolute top-1/2 -left-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background shadow-md hover:bg-muted"
                        >
                          <ChevronLeft className="size-4" />
                        </button>
                        <button
                          type="button"
                          aria-label="Scroll months right"
                          onClick={() => scrollFlexMonths(1)}
                          className="absolute top-1/2 -right-3 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background shadow-md hover:bg-muted"
                        >
                          <ChevronRight className="size-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </PanelResize>
            </PopoverContent>
          </Popover>

          <Divider faded={activeSegment !== null} />

          <Popover open={whoOpen} onOpenChange={setWhoOpen}>
            <PopoverTrigger
              render={
                <button
                  type="button"
                  data-segment="who"
                  className="relative z-10 min-w-0 flex-[0.9] rounded-full px-4 py-2 text-left transition-colors hover:bg-muted"
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
            <PopoverContent className="w-72" align="end" anchor={pillAnchor}>
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
      </div>
    );
  },
);

function Divider({ faded }: { faded: boolean }) {
  return (
    <div
      className={cn(
        "my-2 hidden w-px self-stretch bg-border transition-opacity duration-300 sm:block",
        faded && "opacity-0",
      )}
    />
  );
}

function WhenTabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "relative z-10 rounded-full py-1.5 text-sm font-medium transition-colors motion-safe:duration-[180ms] motion-safe:ease-out motion-reduce:transition-none",
        active ? "text-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

/**
 * Animates the popover between the two tab panels' natural sizes. The inner
 * div sizes to content; a ResizeObserver copies that size onto the outer div
 * as explicit width/height so CSS can transition the change.
 */
function PanelResize({ children }: { children: React.ReactNode }) {
  const innerRef = React.useRef<HTMLDivElement>(null);
  const [size, setSize] = React.useState<{ width: number; height: number } | null>(null);

  React.useLayoutEffect(() => {
    const el = innerRef.current;
    if (!el) return;
    const update = () => setSize({ width: el.offsetWidth, height: el.offsetHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className="overflow-hidden transition-[width,height] duration-300 ease-out motion-reduce:transition-none"
      style={size ? { width: size.width, height: size.height } : undefined}
    >
      <div ref={innerRef} className="w-max max-w-[92vw]">
        {children}
      </div>
    </div>
  );
}

function RangeChip({
  active,
  disabled,
  onClick,
  children,
}: {
  active: boolean;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors motion-safe:duration-[180ms] motion-safe:ease-out motion-reduce:transition-none disabled:cursor-not-allowed disabled:opacity-40",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-muted",
      )}
    >
      {children}
    </button>
  );
}

function MonthCard({
  month,
  active,
  onClick,
}: {
  month: Date;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-28 shrink-0 snap-start flex-col items-center gap-2 rounded-2xl border px-3 py-5 text-center transition-[border-color,box-shadow] motion-safe:duration-[180ms] motion-safe:ease-out motion-reduce:transition-none",
        active ? "border-foreground ring-1 ring-inset ring-foreground" : "border-border hover:border-foreground/50",
      )}
    >
      <CalendarIcon className="size-6 text-muted-foreground" />
      <span className="text-sm font-medium">{format(month, "MMMM")}</span>
      <span className="text-xs text-muted-foreground">{format(month, "yyyy")}</span>
    </button>
  );
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
