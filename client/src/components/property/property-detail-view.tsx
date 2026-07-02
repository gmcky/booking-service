"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MapPin, Star, Check } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/lib/auth/store";
import {
  propertyApi,
  amenityLabel,
  formatPrice,
  formatRating,
  typeLabel,
  type PropertyReview,
} from "@/lib/api/properties";

const PHOTO_STRIPES =
  "repeating-linear-gradient(135deg,var(--muted),var(--muted) 11px,var(--background) 11px,var(--background) 22px)";

function nightsBetween(checkIn?: Date, checkOut?: Date): number {
  if (!checkIn || !checkOut) return 0;
  const ms = checkOut.getTime() - checkIn.getTime();
  return ms > 0 ? Math.round(ms / 86_400_000) : 0;
}

function toISODate(date?: Date): string | undefined {
  return date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
      ).padStart(2, "0")}`
    : undefined;
}

export function PropertyDetailView({ id }: { id: string }) {
  const { data, isPending, isError, error } = useQuery({
    queryKey: ["property", id],
    queryFn: () => propertyApi.byId(id),
  });

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
  const gallery = property.images.length > 0 ? property.images.slice(0, 5) : [];

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
        </div>

        <Gallery images={gallery} title={property.title} />

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
              <div className="size-12 shrink-0 rounded-full border border-border bg-muted" />
            </div>

            <div className="border-b border-border py-6">
              <p className="text-[15px] leading-relaxed text-pretty">{property.description}</p>
            </div>

            {property.amenities.length > 0 ? (
              <div className="border-b border-border py-6">
                <h2 className="mb-[18px] text-[19px] font-semibold tracking-tight">
                  What this place offers
                </h2>
                <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
                  {property.amenities.map((a) => (
                    <div key={a} className="flex items-center gap-3 text-sm">
                      <Check className="size-[18px] shrink-0 text-muted-foreground" />
                      {amenityLabel(a)}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="py-6 pb-1">
              <h2 className="mb-[18px] flex items-center gap-2 text-[19px] font-semibold tracking-tight">
                <Star className="size-[17px] fill-current" />
                {rating ? `${rating} · ` : ""}
                {property.reviewCount} {property.reviewCount === 1 ? "review" : "reviews"}
              </h2>
              {property.reviews.length === 0 ? (
                <p className="text-sm text-muted-foreground">No reviews yet.</p>
              ) : (
                <div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
                  {property.reviews.map((r) => (
                    <ReviewItem key={r.id} review={r} />
                  ))}
                </div>
              )}
            </div>
          </div>

          <aside className="lg:sticky lg:top-22">
            <BookingCard
              propertyId={property.id}
              pricePerNight={property.pricePerNight}
              maxGuests={property.maxGuests}
              rating={rating}
            />
          </aside>
        </div>

        <footer className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-border py-8">
          <span className="font-mono text-xs text-muted-foreground">© 2026 Perch</span>
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

function Gallery({ images, title }: { images: string[]; title: string }) {
  const cells = images.length > 0 ? images : Array.from({ length: 5 }, () => null);
  return (
    <div className="mb-10 grid h-[420px] grid-cols-3 grid-rows-2 gap-2 overflow-hidden rounded-xl">
      {cells.slice(0, 5).map((src, i) => (
        <div
          key={i}
          className={`flex items-center justify-center ${i === 0 ? "col-span-1 row-span-2" : ""}`}
          style={{ backgroundImage: PHOTO_STRIPES }}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={src} alt={title} className="size-full object-cover" />
          ) : (
            <span className="font-mono text-[11px] text-muted-foreground">no photo</span>
          )}
        </div>
      ))}
    </div>
  );
}

function ReviewItem({ review }: { review: PropertyReview }) {
  const date = new Date(review.createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });
  return (
    <div>
      <div className="mb-2 flex items-center gap-2.5">
        <span className="size-[34px] rounded-full border border-border bg-muted" />
        <div>
          <div className="text-sm font-medium">{review.user.firstName}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{date}</div>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 text-[13px]">
          <Star className="size-3.5 fill-current" />
          {review.rating}
        </span>
      </div>
      {review.comment ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{review.comment}</p>
      ) : null}
    </div>
  );
}

function BookingCard({
  propertyId,
  pricePerNight,
  maxGuests,
  rating,
}: {
  propertyId: string;
  pricePerNight: string;
  maxGuests: number;
  rating: string | null;
}) {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const [checkIn, setCheckIn] = React.useState<Date | undefined>();
  const [checkOut, setCheckOut] = React.useState<Date | undefined>();
  const [guests, setGuests] = React.useState("1");

  const nights = nightsBetween(checkIn, checkOut);
  const subtotal = nights * Number(pricePerNight);
  const canReserve = nights > 0;

  function onReserve() {
    if (status !== "authed") {
      router.push("/login");
      return;
    }
    const parsedGuests = Number(guests);
    const effectiveGuests = Number.isFinite(parsedGuests)
      ? Math.min(Math.max(Math.round(parsedGuests), 1), maxGuests)
      : 1;
    const params = new URLSearchParams({
      propertyId,
      checkIn: toISODate(checkIn)!,
      checkOut: toISODate(checkOut)!,
      guests: String(effectiveGuests),
    });
    router.push(`/checkout?${params.toString()}`);
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
            <Label className="mb-1.5 font-mono text-[10px] tracking-wide uppercase text-muted-foreground">
              Check in
            </Label>
            <DatePicker value={checkIn} onChange={setCheckIn} placeholder="Add date" />
          </div>
          <div>
            <Label className="mb-1.5 font-mono text-[10px] tracking-wide uppercase text-muted-foreground">
              Check out
            </Label>
            <DatePicker value={checkOut} onChange={setCheckOut} placeholder="Add date" />
          </div>
        </div>
        <div>
          <Label
            htmlFor="guests"
            className="mb-1.5 font-mono text-[10px] tracking-wide uppercase text-muted-foreground"
          >
            Guests
          </Label>
          <Input
            id="guests"
            type="number"
            min={1}
            max={maxGuests}
            value={guests}
            onChange={(e) => setGuests(e.target.value)}
            onBlur={() => {
              const n = Number(guests);
              if (!Number.isFinite(n)) {
                setGuests("1");
                return;
              }
              setGuests(String(Math.min(Math.max(Math.round(n), 1), maxGuests)));
            }}
          />
        </div>
      </div>

      <Button size="lg" className="mt-3 w-full" disabled={!canReserve} onClick={onReserve}>
        Reserve
      </Button>
      <p className="mt-3 text-center text-[13px] text-muted-foreground">
        You won&apos;t be charged yet
      </p>

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
