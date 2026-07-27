"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { usePathname, useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import type { DateRange } from "react-day-picker";
import { addDays, addMonths, format, isSameMonth, startOfMonth } from "date-fns";
import {
  MapPin,
  Search,
  Users,
  Navigation,
  CalendarIcon,
  ChevronLeft,
  ChevronRight,
  X,
} from "lucide-react";
import { useMediaQuery } from "@/lib/hooks/use-media-query";
import { useOverlayHistory } from "@/lib/hooks/use-overlay-history";
import { lockBodyScroll } from "@/lib/utils/scroll-lock";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Calendar } from "@/components/ui/calendar";
import { GuestStepper, GuestToggle } from "@/components/search/guest-fields";
import { propertyApi, type LocationCountry, type PropertyQuery } from "@/lib/api/properties";
import { queryKeys } from "@/lib/query/keys";
import { useDetectedLocation } from "@/lib/geo/use-detected-location";
import { boundsAround, resolveNearbyCity, type NearbyCity } from "@/lib/geo/nearby";
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

export interface SearchPillHandle {
  openWhere: () => void;
}

export interface SearchPillProps {
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
  /**
   * With `collapsible`, the collapsed state is a single "Start your search"
   * bar (mobile home) rather than the three-segment strip.
   */
  compact?: boolean;
  /**
   * Fires just before the pill navigates to a new search. The browse page uses
   * it to forget the map camera it was remembering: a submitted search owns
   * the viewport, while a history navigation between existing searches does
   * not — which is the distinction a URL comparison could never make.
   */
  onNewSearch?: () => void;
}

function clampAdults(adults: number, children: number, infants: boolean): number {
  const min = children > 0 || infants ? 1 : 0;
  const max = Math.max(min, MAX_GUESTS - children);
  return Math.min(max, Math.max(min, adults));
}

function clampChildren(children: number, adults: number): number {
  return Math.min(Math.max(0, children), Math.max(0, MAX_GUESTS - adults));
}

/**
 * The calendar reports a single tapped day as `from === to`, and a stay is at
 * least one night, so that day means "arrive, leave the next morning". Sending
 * the raw pair instead would be an empty range, which the API rejects.
 */
function stayRange(range?: DateRange): { from: Date; to: Date } | undefined {
  if (!range?.from) return undefined;
  const to = range.to && range.to > range.from ? range.to : addDays(range.from, 1);
  return { from: range.from, to };
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
  function SearchPill({ initialFilters, className, collapsible, compact, onNewSearch }, ref) {
    const router = useRouter();
    const pathname = usePathname();

    const rootRef = React.useRef<HTMLDivElement>(null);
    const [expanded, setExpanded] = React.useState(!collapsible);

    // Below md every search entry point opens a full-screen stepped flow
    // (Where → When → Who cards) instead of the desktop morphing popover,
    // which was never designed for phone widths.
    const isMobile = useMediaQuery("(max-width: 767px)");
    const [mobileStep, setMobileStep] = React.useState<SegmentKey | null>(null);

    // Crossing the breakpoint with the overlay open (rotation, resize)
    // hands off to the desktop popover rather than stranding a hidden overlay.
    // The other direction collapses the pill: the expanded panel is a desktop
    // layout, and at phone widths it renders as a stretched oval nobody
    // designed — the stepped flow is the phone's version of it.
    React.useEffect(() => {
      if (!isMobile) setMobileStep(null);
      else if (collapsible) setExpanded(false);
    }, [isMobile, collapsible]);

    const mobileOverlayOpen = mobileStep !== null;
    React.useEffect(() => {
      if (!mobileOverlayOpen) return;
      return lockBodyScroll();
    }, [mobileOverlayOpen]);

    // Back dismisses the search flow rather than the page it was opened from.
    const releaseOverlayHistory = useOverlayHistory(
      mobileOverlayOpen,
      React.useCallback(() => setMobileStep(null), []),
    );

    // The Where/When/Who panels render inside ONE shared popup box that
    // morphs (position + size) between segments instead of closing and
    // reopening: `openSegment` is what the user asked for, `displayed` is
    // the content currently mounted in the box — they diverge for ~110ms
    // while the old content fades out before the box glides over.
    const [openSegment, setOpenSegment] = React.useState<SegmentKey | null>(null);
    const [displayed, setDisplayed] = React.useState<SegmentKey | null>(null);
    const [contentVisible, setContentVisible] = React.useState(false);

    React.useEffect(() => {
      if (openSegment === displayed) return;
      if (!openSegment || !displayed) {
        // Plain open or close — no crossfade choreography needed.
        setDisplayed(openSegment);
        setContentVisible(Boolean(openSegment));
        return;
      }
      setContentVisible(false);
      const timer = window.setTimeout(() => {
        setDisplayed(openSegment);
        setContentVisible(true);
      }, 110);
      return () => window.clearTimeout(timer);
    }, [openSegment, displayed]);

    function expandAndOpen(segment: SegmentKey) {
      if (isMobile) {
        setMobileStep(segment);
        return;
      }
      setExpanded(true);
      setOpenSegment(segment);
    }

    function toggleSegment(segment: SegmentKey) {
      if (isMobile) {
        setMobileStep(segment);
        return;
      }
      setOpenSegment((current) => (current === segment ? null : segment));
    }

    // One outside click dismisses the panel; the next one collapses the
    // pill (browse) — mirrors how the popover-based version behaved.
    React.useEffect(() => {
      // The overlay is portaled outside rootRef — its taps must not count
      // as "outside the pill".
      if (mobileStep) return;
      if (!openSegment && !(collapsible && expanded)) return;
      function handlePointerDown(e: PointerEvent) {
        if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
          if (openSegment) setOpenSegment(null);
          else setExpanded(false);
        }
      }
      document.addEventListener("pointerdown", handlePointerDown);
      return () => document.removeEventListener("pointerdown", handlePointerDown);
    }, [collapsible, expanded, openSegment, mobileStep]);

    React.useEffect(() => {
      if (!openSegment && !mobileStep) return;
      function handleKeyDown(e: KeyboardEvent) {
        if (e.key !== "Escape") return;
        if (mobileStep) setMobileStep(null);
        else setOpenSegment(null);
      }
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }, [openSegment, mobileStep]);

    const activeSegment = openSegment;

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

    // Shared panel geometry: aligned to the pill (Where left, When centered,
    // Who right — Airbnb layout), clamped into the viewport, sized to the
    // displayed content. Transitioning left/width/height on this box is what
    // produces the single-box morph between segments.
    const panelContentRef = React.useRef<HTMLDivElement>(null);
    const [panelBox, setPanelBox] = React.useState<{
      left: number;
      width: number;
      height: number;
    } | null>(null);

    React.useLayoutEffect(() => {
      if (!displayed) {
        setPanelBox(null);
        return;
      }
      const measure = () => {
        const rootEl = rootRef.current;
        const content = panelContentRef.current;
        if (!rootEl || !content) return;
        const rootRect = rootEl.getBoundingClientRect();
        const width = content.offsetWidth;
        const height = content.offsetHeight;
        let left =
          displayed === "where"
            ? 0
            : displayed === "when"
              ? (rootRect.width - width) / 2
              : rootRect.width - width;
        const minLeft = 8 - rootRect.left;
        const maxLeft = window.innerWidth - 8 - width - rootRect.left;
        left = Math.max(minLeft, Math.min(left, Math.max(minLeft, maxLeft)));
        setPanelBox({ left, width, height });
      };
      measure();
      const observer = new ResizeObserver(measure);
      if (panelContentRef.current) observer.observe(panelContentRef.current);
      window.addEventListener("resize", measure);
      return () => {
        observer.disconnect();
        window.removeEventListener("resize", measure);
      };
    }, [displayed]);

    const [whereQuery, setWhereQuery] = React.useState("");
    const [selection, setSelection] = React.useState<LocationSelection>({
      country: initialFilters?.country,
      city: initialFilters?.city,
      district: initialFilters?.district,
    });

    /**
     * A bbox in the URL means the map's viewport is the location: panning the
     * map drops the named place. Until the user picks a new destination the
     * pill speaks for the map, and a search submitted untouched carries the
     * viewport forward instead of silently reviving the old city.
     */
    const [destinationPicked, setDestinationPicked] = React.useState(false);

    // The URL is the truth between searches: panning the map or closing it
    // rewrites the location without the pill's involvement, and a pill still
    // showing the destination that got replaced is worse than showing none.
    const urlCountry = initialFilters?.country;
    const urlCity = initialFilters?.city;
    const urlDistrict = initialFilters?.district;
    React.useEffect(() => {
      setSelection({ country: urlCountry, city: urlCity, district: urlDistrict });
      setDestinationPicked(false);
    }, [urlCountry, urlCity, urlDistrict]);
    const mapBounds =
      initialFilters?.minLat !== undefined &&
      initialFilters.maxLat !== undefined &&
      initialFilters.minLng !== undefined &&
      initialFilters.maxLng !== undefined
        ? {
            minLat: String(initialFilters.minLat),
            maxLat: String(initialFilters.maxLat),
            minLng: String(initialFilters.minLng),
            maxLng: String(initialFilters.maxLng),
          }
        : undefined;
    const mapAreaActive = Boolean(mapBounds) && !destinationPicked;

    // Recomputed each time the When panel opens so a tab left open across
    // midnight can't keep treating yesterday as a selectable "today".
    const whenOpen = openSegment === "when" || mobileStep === "when";
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
        if (isMobile) {
          setMobileStep("where");
          return;
        }
        setExpanded(true);
        setOpenSegment("where");
      },
    }));

    const locationsQuery = useQuery({
      queryKey: queryKeys.properties.locations,
      queryFn: propertyApi.locations,
      staleTime: 5 * 60 * 1000,
    });

    const detected = useDetectedLocation();
    const locations = locationsQuery.data ?? [];
    const filteredLocations = React.useMemo(
      () => filterLocations(locations, whereQuery),
      [locations, whereQuery],
    );

    // Committing a destination advances straight to When (Airbnb flow);
    // picking a city that has districts keeps Where open for the drill-down.
    function advanceToWhen() {
      if (mobileStep) setMobileStep("when");
      else setOpenSegment("when");
    }

    function selectCity(country: string, city: string, districtCount: number) {
      setSelection({ country, city, district: undefined });
      setDestinationPicked(true);
      if (districtCount === 0) advanceToWhen();
    }

    function selectDistrict(country: string, city: string, district: string) {
      setSelection({ country, city, district });
      setDestinationPicked(true);
      advanceToWhen();
    }

    // Named-city shortcut: only usable when the detected city is one that
    // actually has listings, otherwise the search would land on zero results.
    const resolvedNearby: NearbyCity | undefined = React.useMemo(
      () => resolveNearbyCity(locations, detected),
      [locations, detected],
    );
    const [nearbyPending, setNearbyPending] = React.useState(false);
    const [nearbyError, setNearbyError] = React.useState<string | null>(null);
    const mountedRef = React.useRef(true);
    React.useEffect(() => {
      mountedRef.current = true;
      return () => {
        mountedRef.current = false;
      };
    }, []);

    /**
     * Nearby, in falling order of precision:
     *   1. detected city that has listings → a normal city search;
     *   2. coordinates from the edge headers → a box around the visitor;
     *   3. the browser's geolocation prompt → same box.
     * Only the third step can prompt, so the common case stays silent.
     */
    function selectNearby() {
      setNearbyError(null);
      if (resolvedNearby) {
        setSelection({ ...resolvedNearby, district: undefined });
        setDestinationPicked(true);
        advanceToWhen();
        return;
      }
      if (detected?.lat !== undefined && detected?.lng !== undefined) {
        searchAround(detected.lat, detected.lng);
        return;
      }
      if (!navigator.geolocation) {
        setNearbyError("Location unavailable");
        return;
      }
      setNearbyPending(true);
      navigator.geolocation.getCurrentPosition(
        (position) => {
          // The permission prompt outlives the pill: without this the answer
          // would navigate a user who has since gone somewhere else.
          if (!mountedRef.current) return;
          setNearbyPending(false);
          searchAround(position.coords.latitude, position.coords.longitude);
        },
        () => {
          if (!mountedRef.current) return;
          setNearbyPending(false);
          setNearbyError("Location unavailable");
        },
        { timeout: 8000, maximumAge: 10 * 60 * 1000 },
      );
    }

    /** Area search: the bbox replaces the named location, dates/guests stay. */
    function searchAround(lat: number, lng: number) {
      const bounds = boundsAround(lat, lng);
      pushSearch({
        minLat: String(bounds.minLat),
        maxLat: String(bounds.maxLat),
        minLng: String(bounds.minLng),
        maxLng: String(bounds.maxLng),
      });
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

    /** Everything except the location — shared by the city and area searches. */
    function pushSearch(location: Record<string, string>) {
      const params = new URLSearchParams(location);

      const stay = stayRange(range);
      const checkIn =
        whenTab === "flexible" ? toISODate(flexWindow?.checkIn) : toISODate(stay?.from);
      const checkOut =
        whenTab === "flexible" ? toISODate(flexWindow?.checkOut) : toISODate(stay?.to);
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
      const href = qs ? `/browse?${qs}` : "/browse";
      // The overlay is closing by navigating, so its history entry is handed
      // over rather than popped: popping would undo this push.
      releaseOverlayHistory();
      onNewSearch?.();
      if (pathname === "/browse") {
        // Searching from the results page changes only the query string, and
        // /browse is prerendered — in a production build the router drops such
        // a navigation silently, so the search simply never happened (it works
        // in dev, which is what hid it). The history API is what Next documents
        // for search-param updates, and useSearchParams reads it the same way.
        window.history.pushState(null, "", href);
      } else {
        router.push(href);
      }
      setOpenSegment(null);
      setMobileStep(null);
      if (collapsible) setExpanded(false);
    }

    function onSearch() {
      // Untouched while the map drives the search: keep the viewport rather
      // than reviving the destination it replaced.
      if (mapAreaActive && mapBounds) {
        pushSearch(mapBounds);
        return;
      }
      const location: Record<string, string> = {};
      if (selection.country) location.country = selection.country;
      if (selection.city) location.city = selection.city;
      if (selection.district) location.district = selection.district;
      pushSearch(location);
    }

    function clearAll() {
      setSelection({});
      // Clearing is an explicit "anywhere", so the map's area goes too.
      setDestinationPicked(true);
      setWhereQuery("");
      setBase(undefined);
      setChipDays(0);
      setWhenTab("dates");
      setFlexDuration("weekend");
      setFlexMonthsSelected([]);
      setAdults(0);
      setChildren(0);
      setInfants(false);
      setPets(false);
    }

    // While the map's viewport drives the search, the destination the user
    // originally typed is no longer what's being searched — saying "Buenos
    // Aires" over a result set the map is filtering is simply wrong. The label
    // only reverts once they pick somewhere new, which also drops the bbox.
    const whereText = mapAreaActive ? "Map area" : whereLabel(selection);
    const whenText =
      whenTab === "flexible"
        ? flexMonthsSelected.length > 0
          ? `${DURATION_LABEL[flexDuration]} in ${formatMonthsLabel(flexMonthsSelected)}`
          : undefined
        : // Labelled from the stay, not the raw selection, so a single tapped
          // day reads as the night it actually books.
          (() => {
            const stay = stayRange(range);
            return stay ? formatDatesLabel(stay) : undefined;
          })();
    const whoText = (() => {
      const parts: string[] = [];
      if (guestsTotal > 0) parts.push(`${guestsTotal} guest${guestsTotal === 1 ? "" : "s"}`);
      const rules: string[] = [];
      if (pets) rules.push("pets");
      if (infants) rules.push("infants");
      if (rules.length > 0) parts.push(rules.join(" · "));
      return parts.length > 0 ? parts.join(" · ") : undefined;
    })();

    /**
     * What the results currently answer, read from the URL rather than from the
     * pill's own draft. The collapsed bar is a statement about the list behind
     * it: a destination picked in the stepped flow and never submitted used to
     * leave the bar reading "Sydney" over a page of Kyiv listings.
     */
    const activeWhereText = (() => {
      const named = whereLabel({
        country: initialFilters?.country,
        city: initialFilters?.city,
        district: initialFilters?.district,
      });
      if (named) return named;
      return mapBounds ? "Map area" : undefined;
    })();
    const activeWhenText = (() => {
      if (!initialFilters?.checkIn || !initialFilters.checkOut) return undefined;
      return formatDatesLabel({
        from: new Date(initialFilters.checkIn),
        to: new Date(initialFilters.checkOut),
      });
    })();
    const activeWhoText = (() => {
      const parts: string[] = [];
      const guests = initialFilters?.maxGuests ?? 0;
      if (guests > 0) parts.push(`${guests} guest${guests === 1 ? "" : "s"}`);
      const rules: string[] = [];
      if (initialFilters?.petsAllowed) rules.push("pets");
      if (initialFilters?.infantsAllowed) rules.push("infants");
      if (rules.length > 0) parts.push(rules.join(" · "));
      return parts.length > 0 ? parts.join(" · ") : undefined;
    })();

    // Full-screen stepped search flow (phones). Portaled so it escapes any
    // ancestor stacking/transform context; same state as the desktop pill,
    // just different chrome. The destination input deliberately has no
    // autofocus — popping the keyboard on open buries the step cards.
    const mobileOverlay =
      mobileStep && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[60] flex flex-col bg-muted motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-2 motion-safe:duration-200 md:hidden">
              <div className="flex justify-end px-4 pt-4 pb-2">
                <button
                  type="button"
                  aria-label="Close search"
                  onClick={() => setMobileStep(null)}
                  className="flex size-9 items-center justify-center rounded-full border border-border bg-background shadow-sm"
                >
                  <X className="size-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4">
                <div className="flex flex-col gap-3">
                  {mobileStep === "where" ? (
                    <div className="rounded-3xl border border-border bg-card p-5 shadow-lg">
                      <h2 className="text-[22px] font-semibold tracking-tight">Where?</h2>
                      <Input
                        value={whereQuery}
                        onChange={(e) => setWhereQuery(e.target.value)}
                        placeholder="Search destinations"
                        aria-label="Search destinations"
                        className="mt-4 h-12 rounded-xl text-[15px]"
                      />
                      {whereQuery.trim() === "" ? (
                        <div className="mt-4 text-sm font-medium">Suggested destinations</div>
                      ) : null}
                      <div className="mt-1 max-h-[42vh] overflow-y-auto">
                        <DestinationList
                          mobile
                          pending={locationsQuery.isPending}
                          locations={filteredLocations}
                          selection={selection}
                          nearby={resolvedNearby}
                          nearbyVisible={whereQuery.trim() === ""}
                          nearbyPending={nearbyPending}
                          nearbyError={nearbyError}
                          onNearby={selectNearby}
                          onCity={selectCity}
                          onDistrict={selectDistrict}
                        />
                      </div>
                    </div>
                  ) : (
                    <MobileStepRow
                      label="Where"
                      value={whereText ?? "Anywhere"}
                      filled={Boolean(whereText)}
                      onClick={() => setMobileStep("where")}
                    />
                  )}

                  {mobileStep === "when" ? (
                    <div className="rounded-3xl border border-border bg-card p-5 shadow-lg">
                      <h2 className="text-[22px] font-semibold tracking-tight">When?</h2>
                      <div className="mt-4 flex justify-center">
                        <div className="relative grid w-full max-w-60 grid-cols-2 rounded-full bg-muted p-1">
                          <div
                            aria-hidden
                            className={cn(
                              "absolute inset-y-1 left-1 w-[calc(50%-4px)] rounded-full bg-background shadow-sm ring-1 ring-foreground/10 transition-transform duration-200 ease-out motion-reduce:transition-none",
                              whenTab === "flexible" && "translate-x-full",
                            )}
                          />
                          <WhenTabButton
                            active={whenTab === "dates"}
                            onClick={() => setWhenTab("dates")}
                          >
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
                      {whenTab === "dates" ? (
                        <div key="dates" className="motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200">
                          <Calendar
                            mode="range"
                            selected={range}
                            onSelect={onCalendarSelect}
                            numberOfMonths={1}
                            defaultMonth={base?.from}
                            disabled={{ before: today }}
                            showOutsideDays={false}
                            className="mt-2 w-full [--cell-size:--spacing(11)]"
                            classNames={{ root: "w-full", month: "flex w-full flex-col gap-4" }}
                          />
                          <div className="mt-2 flex gap-1.5 overflow-x-auto border-t border-border pt-3 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                            {FLEX_CHIP_DAYS.map((days) => (
                              <RangeChip
                                key={days}
                                active={chipDays === days}
                                disabled={!base?.from}
                                onClick={() => setChipDays(days)}
                              >
                                <span className="whitespace-nowrap">
                                  {days === 0 ? "Exact dates" : `+ ${days} day${days === 1 ? "" : "s"}`}
                                </span>
                              </RangeChip>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <FlexiblePanel
                          key="flexible"
                          mobile
                          className="mt-5 w-full"
                          duration={flexDuration}
                          onDuration={setFlexDuration}
                          months={flexMonths}
                          monthsSelected={flexMonthsSelected}
                          onToggleMonth={toggleFlexMonth}
                        />
                      )}
                    </div>
                  ) : (
                    <MobileStepRow
                      label="When"
                      value={whenText ?? "Anytime"}
                      filled={Boolean(whenText)}
                      onClick={() => setMobileStep("when")}
                    />
                  )}

                  {mobileStep === "who" ? (
                    <div className="rounded-3xl border border-border bg-card p-5 shadow-lg">
                      <h2 className="text-[22px] font-semibold tracking-tight">Who?</h2>
                      <div className="mt-4 flex flex-col gap-2.5">
                        <GuestFields
                          adults={adults}
                          childCount={children}
                          infants={infants}
                          pets={pets}
                          onAdults={(v) => setAdults(clampAdults(v, children, infants))}
                          onChildren={(v) => setChildren(clampChildren(v, adults))}
                          onInfants={setInfants}
                          onPets={setPets}
                        />
                      </div>
                    </div>
                  ) : (
                    <MobileStepRow
                      label="Who"
                      value={whoText ?? "Add guests"}
                      filled={Boolean(whoText)}
                      onClick={() => setMobileStep("who")}
                    />
                  )}
                </div>
              </div>

              <div className="flex items-center justify-between border-t border-border bg-background px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
                <button
                  type="button"
                  onClick={clearAll}
                  className="text-sm font-semibold underline underline-offset-4"
                >
                  Clear all
                </button>
                {mobileStep === "when" ? (
                  <Button size="lg" className="rounded-xl px-8" onClick={() => setMobileStep("who")}>
                    Next
                  </Button>
                ) : (
                  <Button size="lg" className="rounded-xl px-7" onClick={onSearch}>
                    <Search className="mr-1.5" />
                    Search
                  </Button>
                )}
              </div>
            </div>,
            document.body,
          )
        : null;

    if (collapsible && !expanded && compact) {
      const summary = [activeWhereText, activeWhenText, activeWhoText].filter(Boolean).join(" · ");
      return (
        <div ref={rootRef}>
          {mobileOverlay}
          <button
            type="button"
            onClick={() => expandAndOpen("where")}
            className={cn(
              "flex h-14 w-full items-center gap-3 rounded-full border border-border bg-card px-5 shadow-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:duration-200",
              className,
            )}
          >
            <Search className="size-5 shrink-0" />
            <span
              className={cn(
                "truncate text-[15px] font-medium",
                summary ? "text-foreground" : "text-muted-foreground",
              )}
            >
              {summary || "Start your search"}
            </span>
          </button>
        </div>
      );
    }

    if (collapsible && !expanded) {
      return (
        <div ref={rootRef}>
          {mobileOverlay}
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
              <span className={activeWhereText ? "text-foreground" : "text-muted-foreground"}>
                {activeWhereText ?? "Anywhere"}
              </span>
            </button>
            <div className="h-5 w-px shrink-0 bg-border" />
            <button
              type="button"
              onClick={() => expandAndOpen("when")}
              className="min-w-0 flex-1 truncate rounded-full px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              <span className={activeWhenText ? "text-foreground" : "text-muted-foreground"}>
                {activeWhenText ?? "Anytime"}
              </span>
            </button>
            <div className="h-5 w-px shrink-0 bg-border" />
            <button
              type="button"
              onClick={() => expandAndOpen("who")}
              className="min-w-0 flex-1 truncate rounded-full px-4 py-2 text-sm font-medium hover:bg-muted"
            >
              <span className={activeWhoText ? "text-foreground" : "text-muted-foreground"}>
                {activeWhoText ?? "Add guests"}
              </span>
            </button>
            {/* Desktop only. On a phone this button expanded the pill into the
                desktop panel, which is a layout that was never designed for 390px
                — and it looked like a submit while submitting nothing, so a
                destination picked in the stepped flow appeared to be searched
                when it was not. Phones reach the flow by tapping a segment. */}
            <button
              type="button"
              aria-label="Search"
              onClick={() => setExpanded(true)}
              className="hidden size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/80 md:flex"
            >
              <Search className="size-4" />
            </button>
          </div>
        </div>
      );
    }

    return (
      <div ref={rootRef} className="relative">
        {mobileOverlay}
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
          <button
            type="button"
            data-segment="where"
            aria-haspopup="dialog"
            aria-expanded={openSegment === "where"}
            onClick={() => toggleSegment("where")}
            className={cn(
              "relative z-10 min-w-0 flex-[1.4] rounded-full px-4 py-2 text-left transition-colors",
              openSegment !== "where" && "hover:bg-muted",
            )}
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

          <Divider faded={activeSegment !== null} />

          <button
            type="button"
            data-segment="when"
            aria-haspopup="dialog"
            aria-expanded={openSegment === "when"}
            onClick={() => toggleSegment("when")}
            className={cn(
              "relative z-10 min-w-0 flex-1 rounded-full px-4 py-2 text-left transition-colors",
              openSegment !== "when" && "hover:bg-muted",
            )}
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

          <Divider faded={activeSegment !== null} />

          <button
            type="button"
            data-segment="who"
            aria-haspopup="dialog"
            aria-expanded={openSegment === "who"}
            onClick={() => toggleSegment("who")}
            className={cn(
              "relative z-10 min-w-0 flex-[0.9] rounded-full px-4 py-2 text-left transition-colors",
              openSegment !== "who" && "hover:bg-muted",
            )}
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

          <div className="p-2">
            <Button size="lg" className="w-full rounded-full" onClick={onSearch}>
              <Search className="mr-1.5" />
              Search
            </Button>
          </div>
          </div>
        </div>

        {displayed ? (
          <div
            role="dialog"
            className={cn(
              "absolute top-full z-50 mt-1 overflow-hidden rounded-lg bg-popover text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10 outline-hidden",
              "transition-[left,width,height] duration-300 ease-out motion-reduce:transition-none",
              "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95",
            )}
            style={
              panelBox
                ? { left: panelBox.left, width: panelBox.width, height: panelBox.height }
                : undefined
            }
          >
            <div
              ref={panelContentRef}
              className={cn(
                "w-max max-w-[92vw] transition-opacity motion-reduce:transition-none",
                contentVisible ? "opacity-100 delay-100 duration-150" : "opacity-0 duration-100",
              )}
            >
              {displayed === "where" ? (
                <div className="flex w-80 flex-col gap-2.5">
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
                <DestinationList
                  pending={locationsQuery.isPending}
                  locations={filteredLocations}
                  selection={selection}
                  nearby={resolvedNearby}
                  nearbyVisible={whereQuery.trim() === ""}
                  nearbyPending={nearbyPending}
                  nearbyError={nearbyError}
                  onNearby={selectNearby}
                  onCity={selectCity}
                  onDistrict={selectDistrict}
                />
              </div>
                </div>
              ) : displayed === "when" ? (
                <div className="flex flex-col gap-2.5">
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
                  <FlexiblePanel
                    key="flexible"
                    className="w-[640px] max-w-[92vw] px-6 pt-2 pb-7"
                    duration={flexDuration}
                    onDuration={setFlexDuration}
                    months={flexMonths}
                    monthsSelected={flexMonthsSelected}
                    onToggleMonth={toggleFlexMonth}
                  />
                )}
                </div>
              ) : (
                <div className="flex w-72 flex-col gap-2.5 p-2.5">
                  <GuestFields
                    adults={adults}
                    childCount={children}
                    infants={infants}
                    pets={pets}
                    onAdults={(v) => setAdults(clampAdults(v, children, infants))}
                    onChildren={(v) => setChildren(clampChildren(v, adults))}
                    onInfants={setInfants}
                    onPets={setPets}
                  />
                </div>
              )}
            </div>
          </div>
        ) : null}
      </div>
    );
  },
);

function MobileStepRow({
  label,
  value,
  filled,
  onClick,
}: {
  label: string;
  value: string;
  filled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-2xl border border-border bg-card px-5 py-4 text-left shadow-sm"
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-sm font-semibold", !filled && "text-muted-foreground")}>
        {value}
      </span>
    </button>
  );
}

function DestinationList({
  mobile,
  pending,
  locations,
  selection,
  nearby,
  nearbyVisible,
  nearbyPending,
  nearbyError,
  onNearby,
  onCity,
  onDistrict,
}: {
  mobile?: boolean;
  pending: boolean;
  locations: LocationCountry[];
  selection: LocationSelection;
  nearby?: NearbyCity;
  /** Hidden once the user types — a typed query is an explicit destination. */
  nearbyVisible: boolean;
  nearbyPending: boolean;
  nearbyError: string | null;
  onNearby: () => void;
  onCity: (country: string, city: string, districtCount: number) => void;
  onDistrict: (country: string, city: string, district: string) => void;
}) {
  // Always the first entry, with or without a resolved city: without one it
  // falls back to searching the area around the visitor's coordinates.
  const nearbyStatus = nearbyPending ? "Locating…" : (nearbyError ?? nearby?.city);
  const nearbyHint = nearbyPending
    ? "Locating…"
    : (nearbyError ?? (nearby ? `Find what's around you · ${nearby.city}` : "Find what's around you"));

  return (
    <>
      {nearbyVisible ? (
        <button
          type="button"
          onClick={onNearby}
          disabled={nearbyPending}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2.5 text-left text-sm hover:bg-accent disabled:opacity-60",
            mobile ? "gap-3 rounded-xl px-1.5 py-2" : "py-1.5",
          )}
        >
          {mobile ? (
            <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted">
              <Navigation className="size-5 text-muted-foreground" />
            </span>
          ) : (
            <Navigation className="size-4 shrink-0 text-muted-foreground" />
          )}
          {mobile ? (
            <span className="flex min-w-0 flex-col">
              <span className="font-medium">Nearby</span>
              <span className="text-xs text-muted-foreground">{nearbyHint}</span>
            </span>
          ) : (
            <span className="min-w-0 truncate">
              Nearby
              {nearbyStatus ? <span className="text-muted-foreground"> · {nearbyStatus}</span> : null}
            </span>
          )}
        </button>
      ) : null}

      {pending ? (
        <p className="px-2.5 py-3 text-center text-sm text-muted-foreground">Loading…</p>
      ) : locations.length === 0 ? (
        <p className="px-2.5 py-3 text-center text-sm text-muted-foreground">
          No destinations found
        </p>
      ) : (
        locations.map((country) => (
          <div key={country.country}>
            <div
              className={cn(
                "px-2.5 pt-2.5 pb-1 font-mono text-[11px] tracking-wide text-muted-foreground uppercase",
                mobile && "px-1.5",
              )}
            >
              {country.country}
            </div>
            {country.cities.map((city) => {
              const active = selection.country === country.country && selection.city === city.city;
              return (
                <div key={city.city}>
                  <button
                    type="button"
                    onClick={() => onCity(country.country, city.city, city.districts.length)}
                    className={cn(
                      "flex w-full items-center justify-between gap-2 rounded-md px-2.5 text-left text-sm hover:bg-accent",
                      mobile ? "rounded-xl px-1.5 py-2" : "py-1.5",
                      active && "bg-accent",
                    )}
                  >
                    <span className={cn("flex min-w-0 items-center", mobile && "gap-3")}>
                      {mobile ? (
                        <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-muted">
                          <MapPin className="size-5 text-muted-foreground" />
                        </span>
                      ) : null}
                      <span className="truncate">
                        {city.city}, {country.country}
                      </span>
                    </span>
                    <span className="text-xs text-muted-foreground">{city.count}</span>
                  </button>
                  {active && city.districts.length > 0 ? (
                    <div
                      className={cn(
                        "mb-1 ml-4 flex flex-col gap-0.5 border-l border-border pl-2.5",
                        mobile && "ml-6 gap-1",
                      )}
                    >
                      {city.districts.map((d) => (
                        <button
                          key={d.district}
                          type="button"
                          onClick={() => onDistrict(country.country, city.city, d.district)}
                          className={cn(
                            "flex items-center justify-between gap-2 rounded-md px-2 text-left text-[13px] hover:bg-accent",
                            mobile ? "py-2" : "py-1",
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
    </>
  );
}

function FlexiblePanel({
  mobile,
  className,
  duration,
  onDuration,
  months,
  monthsSelected,
  onToggleMonth,
}: {
  mobile?: boolean;
  className?: string;
  duration: FlexibleDuration;
  onDuration: (d: FlexibleDuration) => void;
  months: Date[];
  monthsSelected: Date[];
  onToggleMonth: (m: Date) => void;
}) {
  const scrollRef = React.useRef<HTMLDivElement>(null);

  function scrollMonths(direction: -1 | 1) {
    // Three cards per click: card width (112) + gap (12).
    scrollRef.current?.scrollBy({ left: direction * 372, behavior: "smooth" });
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-6 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-200",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-3.5">
        <h3 className="text-lg font-semibold tracking-tight">Stay for {STAY_LABEL[duration]}</h3>
        <div className="flex flex-wrap justify-center gap-2.5">
          {(Object.keys(DURATION_LABEL) as FlexibleDuration[]).map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => onDuration(d)}
              className={cn(
                "rounded-full border px-5 py-2 text-sm font-medium transition-[border-color,box-shadow] motion-safe:duration-[180ms] motion-safe:ease-out motion-reduce:transition-none",
                duration === d
                  ? "border-foreground ring-1 ring-inset ring-foreground"
                  : "border-border hover:border-foreground/50",
              )}
            >
              {DURATION_LABEL[d]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex w-full flex-col items-center gap-3.5">
        <h3 className="text-lg font-semibold tracking-tight">
          {monthsSelected.length > 0
            ? `Go in ${formatMonthsLabel(monthsSelected, "long")}`
            : "Go anytime"}
        </h3>
        <div className="relative w-full">
          <div
            ref={scrollRef}
            className="flex snap-x snap-mandatory gap-3 overflow-x-auto scroll-smooth px-1 py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          >
            {months.map((month) => (
              <MonthCard
                key={month.toISOString()}
                month={month}
                active={monthsSelected.some((m) => isSameMonth(m, month))}
                onClick={() => onToggleMonth(month)}
              />
            ))}
          </div>
          {!mobile ? (
            <>
              <button
                type="button"
                aria-label="Scroll months left"
                onClick={() => scrollMonths(-1)}
                className="absolute top-1/2 left-0 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background shadow-md hover:bg-muted"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                aria-label="Scroll months right"
                onClick={() => scrollMonths(1)}
                className="absolute top-1/2 right-0 flex size-8 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background shadow-md hover:bg-muted"
              >
                <ChevronRight className="size-4" />
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function GuestFields({
  adults,
  childCount,
  infants,
  pets,
  onAdults,
  onChildren,
  onInfants,
  onPets,
}: {
  adults: number;
  childCount: number;
  infants: boolean;
  pets: boolean;
  onAdults: (v: number) => void;
  onChildren: (v: number) => void;
  onInfants: (v: boolean) => void;
  onPets: (v: boolean) => void;
}) {
  return (
    <>
      <GuestStepper
        label="Adults"
        hint="Ages 13+"
        value={adults}
        onChange={onAdults}
        min={childCount > 0 || infants ? 1 : 0}
        max={MAX_GUESTS - childCount}
      />
      <GuestStepper
        label="Children"
        hint="2–12"
        value={childCount}
        onChange={onChildren}
        max={MAX_GUESTS - adults}
      />
      <div className="my-1 h-px bg-border" />
      <GuestToggle
        label="Infants"
        hint="Under 2, suitable stays only"
        checked={infants}
        onCheckedChange={onInfants}
      />
      <GuestToggle
        label="Pets"
        hint="Pet-friendly stays only"
        checked={pets}
        onCheckedChange={onPets}
      />
    </>
  );
}

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

