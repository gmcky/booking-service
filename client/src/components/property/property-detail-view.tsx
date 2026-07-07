"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { ArrowLeft, ChevronDown, MapPin, Star } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { GuestStepper, GuestToggle } from "@/components/search/guest-fields";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ReviewItem } from "@/components/reviews/review-item";
import { PhotoGallery } from "@/components/property/photo-gallery";
import { Highlights } from "@/components/property/highlights";
import { AmenitiesSection } from "@/components/property/amenities-section";
import { AvailabilitySection } from "@/components/property/availability-section";
import { LocationSection } from "@/components/property/location-section";
import { HostSection } from "@/components/property/host-section";
import { useBlockedDates } from "@/components/property/use-blocked-dates";
import { FavoriteButton } from "@/components/property/favorite-button";
import { useAuthStore } from "@/lib/auth/store";
import { propertyApi } from "@/lib/api/properties";
import { bookingApi } from "@/lib/api/bookings";
import { typeLabel } from "@/lib/api/labels";
import { formatPrice, formatRating } from "@/lib/utils/money";
import { reviewApi, type ReviewQuery, type ReviewSort, type ReviewStats } from "@/lib/api/reviews";
import { nightsBetween, toISODate } from "@/lib/utils/dates";
import { queryKeys } from "@/lib/query/keys";

const REVIEW_PAGE_SIZE = 10;

const REVIEW_SORTS: { value: ReviewSort; label: string }[] = [
  { value: "recent", label: "Most recent" },
  { value: "highest", label: "Highest rated" },
  { value: "lowest", label: "Lowest rated" },
];

const REVIEW_RATING_FILTERS = [
  { value: "all", label: "All ratings" },
  { value: "5", label: "5 stars" },
  { value: "4", label: "4 stars" },
  { value: "3", label: "3 stars" },
  { value: "2", label: "2 stars" },
  { value: "1", label: "1 star" },
];

export function PropertyDetailView({ id }: { id: string }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.properties.detail(id),
    queryFn: () => propertyApi.byId(id),
  });
  // Stay range shared between the availability calendar and the reserve
  // card — picking dates in either reprices the booking.
  const [checkIn, setCheckIn] = React.useState<Date | undefined>();
  const [checkOut, setCheckOut] = React.useState<Date | undefined>();

  function handleCheckInChange(date?: Date) {
    setCheckIn(date);
    setCheckOut((out) => (date && out && out <= date ? undefined : out));
  }

  if (isPending) {
    return (
      <div className="flex flex-1 flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-[1120px] px-6 pt-6">
          <div className="mb-10 h-[420px] animate-pulse rounded-xl bg-muted" />
          <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
        </main>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-1 flex-col">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
          <p className="text-sm text-destructive">{(error as Error).message}</p>
          <Button nativeButton={false} variant="outline" render={<Link href="/browse" />}>
            Back to all stays
          </Button>
        </main>
      </div>
    );
  }

  const property = data;
  const rating = formatRating(property.averageRating);

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1120px] px-6 pt-6">
        <Link
          href="/browse"
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-[15px]" />
          All stays
        </Link>

        <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mb-2 text-3xl font-semibold tracking-tight">{property.title}</h1>
            <div className="flex flex-wrap items-center gap-3.5 text-sm">
              {rating ? (
                <span className="inline-flex items-center gap-1.5">
                  <Star className="size-[15px] fill-current" />
                  <strong className="font-semibold">{rating}</strong>
                  <span className="text-muted-foreground">
                    · {property.reviewCount} {property.reviewCount === 1 ? "review" : "reviews"}
                  </span>
                </span>
              ) : (
                <span className="text-muted-foreground">No reviews yet</span>
              )}
              <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                <MapPin className="size-[15px]" />
                {property.city}
              </span>
            </div>
          </div>
          <FavoriteButton propertyId={property.id} variant="labeled" className="shrink-0" />
        </div>

        <PhotoGallery images={property.images} title={property.title} />

        <div className="grid items-start gap-16 lg:grid-cols-[1fr_372px]">
          <div className="min-w-0">
            <div className="flex items-center justify-between gap-4 border-b border-border pb-6">
              <div>
                <h2 className="mb-1 text-[19px] font-semibold tracking-tight">
                  {typeLabel(property.type)} hosted by {property.owner.firstName}
                </h2>
                <p className="text-sm text-muted-foreground">
                  Up to {property.maxGuests} {property.maxGuests === 1 ? "guest" : "guests"}
                </p>
              </div>
              <Link href={`/hosts/${property.owner.id}`} className="shrink-0">
                <Avatar className="size-12 border border-border">
                  {property.owner.avatarUrl ? (
                    <AvatarImage src={property.owner.avatarUrl} alt="" />
                  ) : null}
                  <AvatarFallback>
                    {`${property.owner.firstName[0] ?? ""}${property.owner.lastName[0] ?? ""}`.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
              </Link>
            </div>

            <Highlights property={property} />

            <div className="border-b border-border py-6">
              <p className="text-[15px] leading-relaxed text-pretty">{property.description}</p>
            </div>

            <AmenitiesSection amenities={property.amenities} />

            <AvailabilitySection
              propertyId={property.id}
              city={property.city}
              checkIn={checkIn}
              checkOut={checkOut}
              onRangeChange={(nextIn, nextOut) => {
                setCheckIn(nextIn);
                setCheckOut(nextOut);
              }}
            />

            <PropertyReviews propertyId={property.id} propertyOwnerId={property.owner.id} />

            <LocationSection property={property} />

            <HostSection ownerId={property.owner.id} />
          </div>

          <aside className="scroll-mt-32 lg:sticky lg:top-22">
            <BookingCard
              propertyId={property.id}
              pricePerNight={property.pricePerNight}
              maxGuests={property.maxGuests}
              petsAllowed={property.petsAllowed}
              infantsAllowed={property.infantsAllowed}
              rating={rating}
              checkIn={checkIn}
              checkOut={checkOut}
              onCheckInChange={handleCheckInChange}
              onCheckOutChange={setCheckOut}
            />
          </aside>
        </div>

        <footer className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-border py-8">
          <span className="font-mono text-xs text-muted-foreground">© 2026 GMCK Booking</span>
          <nav className="flex gap-5 text-[13px] text-muted-foreground">
            <Link href="#">Support</Link>
            <Link href="#">Privacy</Link>
            <Link href="#">Terms</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}

function PropertyReviews({
  propertyId,
  propertyOwnerId,
}: {
  propertyId: string;
  propertyOwnerId: string;
}) {
  const queryClient = useQueryClient();
  const [sort, setSort] = React.useState<ReviewSort>("recent");
  const [ratingFilter, setRatingFilter] = React.useState("all");

  const filters: ReviewQuery = {
    sort,
    rating: ratingFilter === "all" ? undefined : Number(ratingFilter),
    limit: REVIEW_PAGE_SIZE,
  };

  const statsQuery = useQuery({
    queryKey: queryKeys.reviews.stats(propertyId),
    queryFn: () => reviewApi.stats(propertyId),
  });

  const listQuery = useInfiniteQuery({
    queryKey: queryKeys.reviews.list(propertyId, filters),
    queryFn: ({ pageParam }) => reviewApi.list(propertyId, { ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const page = last.pagination.page ?? 1;
      const totalPages = last.pagination.totalPages ?? page;
      return page < totalPages ? page + 1 : undefined;
    },
  });

  const reviews = listQuery.data?.pages.flatMap((p) => p.data) ?? [];
  const stats = statsQuery.data;
  const statsRating = formatRating(stats?.averageRating ?? null);

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ["reviews", "list", propertyId] });
    queryClient.invalidateQueries({ queryKey: queryKeys.reviews.stats(propertyId) });
    queryClient.invalidateQueries({ queryKey: queryKeys.properties.detail(propertyId) });
  }

  return (
    <div id="reviews" className="scroll-mt-32 py-6 pb-1">
      <h2 className="mb-[18px] flex items-center gap-2 text-[19px] font-semibold tracking-tight">
        <Star className="size-[17px] fill-current" />
        {statsRating ? `${statsRating} · ` : ""}
        {stats?.totalReviews ?? 0} {stats?.totalReviews === 1 ? "review" : "reviews"}
      </h2>

      {stats ? <RatingBreakdown stats={stats} /> : null}

      <div className="mb-5 flex flex-wrap items-center gap-2.5">
        <Select value={sort} onValueChange={(v) => setSort(v as ReviewSort)}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REVIEW_SORTS.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={ratingFilter} onValueChange={(v) => setRatingFilter(v as string)}>
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {REVIEW_RATING_FILTERS.map((r) => (
              <SelectItem key={r.value} value={r.value}>
                {r.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {listQuery.isError ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-destructive">{(listQuery.error as Error).message}</p>
          <Button variant="outline" size="sm" onClick={() => listQuery.refetch()}>
            Try again
          </Button>
        </div>
      ) : listQuery.isPending ? (
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
            {reviews.map((r) => (
              <ReviewItem
                key={r.id}
                review={r}
                propertyOwnerId={propertyOwnerId}
                onChanged={invalidate}
              />
            ))}
          </div>
          {listQuery.hasNextPage ? (
            <div className="flex justify-center py-6">
              <Button
                variant="outline"
                size="sm"
                onClick={() => listQuery.fetchNextPage()}
                disabled={listQuery.isFetchingNextPage}
              >
                {listQuery.isFetchingNextPage ? "Loading…" : "Load more"}
              </Button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

function RatingBreakdown({ stats }: { stats: ReviewStats }) {
  if (stats.totalReviews === 0) return null;
  return (
    <div className="mb-6 flex flex-col gap-1.5">
      {([5, 4, 3, 2, 1] as const).map((n) => {
        const count = stats.breakdown[n] ?? 0;
        const pct = (count / stats.totalReviews) * 100;
        return (
          <div key={n} className="flex items-center gap-2.5 text-sm">
            <span className="w-8 shrink-0 text-muted-foreground">{n}★</span>
            <div className="h-1.5 flex-1 rounded-full bg-muted">
              <div className="h-1.5 rounded-full bg-foreground" style={{ width: `${pct}%` }} />
            </div>
            <span className="w-6 shrink-0 text-right font-mono text-[11px] text-muted-foreground">
              {count}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const MAX_INFANTS = 5;

function BookingCard({
  propertyId,
  pricePerNight,
  maxGuests,
  petsAllowed,
  infantsAllowed,
  rating,
  checkIn,
  checkOut,
  onCheckInChange,
  onCheckOutChange,
}: {
  propertyId: string;
  pricePerNight: string;
  maxGuests: number;
  petsAllowed: boolean;
  infantsAllowed: boolean;
  rating: string | null;
  checkIn?: Date;
  checkOut?: Date;
  onCheckInChange: (date?: Date) => void;
  onCheckOutChange: (date?: Date) => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useAuthStore((s) => s.status);
  // Adults + children share the property's guest limit; infants don't count
  // toward it (same rule as the search pill) and pets are a yes/no.
  const [adults, setAdults] = React.useState(1);
  const [children, setChildren] = React.useState(0);
  const [infants, setInfants] = React.useState(0);
  const [pets, setPets] = React.useState(false);
  const [conflict, setConflict] = React.useState<string | null>(null);

  const guestsTotal = adults + children;
  const guestsLabel = [
    `${guestsTotal} ${guestsTotal === 1 ? "guest" : "guests"}`,
    infants > 0 ? `${infants} ${infants === 1 ? "infant" : "infants"}` : null,
    pets ? "pets" : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // Dates can also change from the availability calendar — any change
  // invalidates a previously reported conflict.
  React.useEffect(() => {
    setConflict(null);
  }, [checkIn, checkOut]);

  const {
    isPending: blockedPending,
    isError: blockedError,
    blockedMatchers,
    checkoutMatchers,
  } = useBlockedDates(propertyId);

  const today = React.useMemo(() => {
    const t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }, []);

  const nights = nightsBetween(checkIn, checkOut);
  const subtotal = nights * Number(pricePerNight);
  const canReserve = nights > 0;

  const availability = useMutation({
    mutationFn: () =>
      bookingApi.checkAvailability({
        propertyId,
        checkIn: toISODate(checkIn)!,
        checkOut: toISODate(checkOut)!,
      }),
    onSuccess: (available) => {
      if (!available) {
        setConflict("Those dates are no longer available. Please pick different dates.");
        // Calendar was drawn from stale blocked-dates — refresh so the
        // rejected range shows as disabled instead of inviting a retry.
        queryClient.invalidateQueries({
          queryKey: queryKeys.bookings.blockedDates(propertyId),
        });
        return;
      }
      const params = new URLSearchParams({
        propertyId,
        checkIn: toISODate(checkIn)!,
        checkOut: toISODate(checkOut)!,
        guests: String(Math.min(Math.max(guestsTotal, 1), maxGuests)),
      });
      router.push(`/checkout?${params.toString()}`);
    },
    onError: (error) => {
      setConflict((error as Error).message);
    },
  });

  function onReserve() {
    if (status !== "authed") {
      const returnTo = encodeURIComponent(`/properties/${propertyId}`);
      router.push(`/login?returnTo=${returnTo}`);
      return;
    }
    setConflict(null);
    availability.mutate();
  }

  return (
    <Card className="p-6">
      <div className="mb-[18px] flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold tracking-tight">{formatPrice(pricePerNight)}</span>
        <span className="text-sm text-muted-foreground">night</span>
        {rating ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[13px]">
            <Star className="size-3.5 fill-current" />
            {rating}
          </span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label className="mb-1.5 flex-col items-start gap-1.5">
              <span className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground">
                Check in
              </span>
              <DatePicker
                value={checkIn}
                onChange={onCheckInChange}
                placeholder="Add date"
                label="Check in"
                className="text-[13px]"
                disabledDates={[{ before: today }, ...blockedMatchers]}
              />
            </Label>
          </div>
          <div>
            <Label className="mb-1.5 flex-col items-start gap-1.5">
              <span className="font-mono text-[10px] tracking-wide uppercase text-muted-foreground">
                Check out
              </span>
              <DatePicker
                value={checkOut}
                onChange={onCheckOutChange}
                placeholder="Add date"
                label="Check out"
                className="text-[13px]"
                disabledDates={[
                  { before: addDays(checkIn ?? today, 1) },
                  ...checkoutMatchers,
                ]}
                defaultMonth={checkOut ?? checkIn}
              />
            </Label>
          </div>
        </div>
        {blockedPending ? (
          <p className="text-xs text-muted-foreground">Checking availability…</p>
        ) : blockedError ? (
          <p className="text-xs text-amber-600">
            Couldn't load availability — we'll double-check when you reserve.
          </p>
        ) : null}
        <div>
          <span className="mb-1.5 block font-mono text-[10px] tracking-wide uppercase text-muted-foreground">
            Guests
          </span>
          <Popover>
            <PopoverTrigger
              render={
                <Button
                  variant="outline"
                  className="w-full justify-between font-normal text-[13px]"
                  aria-label={`Guests, ${guestsLabel}`}
                >
                  {guestsLabel}
                  <ChevronDown className="size-4 text-muted-foreground" />
                </Button>
              }
            />
            <PopoverContent className="w-72" align="end">
              <GuestStepper
                label="Adults"
                hint="Ages 13+"
                value={adults}
                onChange={(v) => setAdults(Math.min(Math.max(1, v), maxGuests - children))}
                min={1}
                max={maxGuests - children}
              />
              <GuestStepper
                label="Children"
                hint="2–12"
                value={children}
                onChange={(v) => setChildren(Math.min(Math.max(0, v), maxGuests - adults))}
                max={maxGuests - adults}
              />
              {infantsAllowed ? (
                <GuestStepper
                  label="Infants"
                  hint="Under 2 — don't count toward the limit"
                  value={infants}
                  onChange={(v) => setInfants(Math.min(Math.max(0, v), MAX_INFANTS))}
                  max={MAX_INFANTS}
                />
              ) : null}
              {petsAllowed ? (
                <>
                  <div className="my-1 h-px bg-border" />
                  <GuestToggle
                    label="Pets"
                    hint="This stay allows pets"
                    checked={pets}
                    onCheckedChange={setPets}
                  />
                </>
              ) : null}
              <p className="pt-1 text-xs text-muted-foreground">
                This place fits up to {maxGuests} {maxGuests === 1 ? "guest" : "guests"}
                {infantsAllowed ? " (infants excluded)" : ""}.
              </p>
            </PopoverContent>
          </Popover>
        </div>
      </div>

      <Button
        size="lg"
        className="mt-3 w-full"
        disabled={!canReserve || availability.isPending}
        onClick={onReserve}
      >
        {availability.isPending ? "Checking availability…" : "Reserve"}
      </Button>
      {conflict ? (
        <p className="mt-3 text-center text-[13px] text-destructive" role="alert">
          {conflict}
        </p>
      ) : (
        <p className="mt-3 text-center text-[13px] text-muted-foreground">
          You won&apos;t be charged yet
        </p>
      )}

      {nights > 0 ? (
        <div className="mt-[18px] flex flex-col gap-2.5 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground underline underline-offset-2">
              {formatPrice(pricePerNight)} × {nights} {nights === 1 ? "night" : "nights"}
            </span>
            <span>{formatPrice(subtotal)}</span>
          </div>
          <div className="flex justify-between border-t border-border pt-3 font-semibold">
            <span>Total before taxes</span>
            <span>{formatPrice(subtotal)}</span>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
