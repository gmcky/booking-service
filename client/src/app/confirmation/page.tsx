"use client";

import * as React from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, Calendar, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { bookingApi } from "@/lib/api/bookings";
import { formatPrice } from "@/lib/utils/money";
import { PHOTO_STRIPES, photoUrl } from "@/lib/utils/photo";
import { formatRange } from "@/lib/utils/dates";
import { queryKeys } from "@/lib/query/keys";

export default function ConfirmationPage() {
  return (
    <React.Suspense fallback={<Centered><Loader2 className="size-5 animate-spin text-muted-foreground" /></Centered>}>
      <ConfirmationInner />
    </React.Suspense>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center px-6 py-10">{children}</div>
  );
}

function ConfirmationInner() {
  const bookingId = useSearchParams().get("bookingId") ?? "";

  const { data: booking, isPending, isError } = useQuery({
    queryKey: queryKeys.bookings.detail(bookingId),
    queryFn: () => bookingApi.byId(bookingId),
    enabled: Boolean(bookingId),
  });

  if (!bookingId || isError) {
    return (
      <Centered>
        <div className="w-full max-w-[440px] text-center">
          <p className="mb-4 text-sm text-muted-foreground">We couldn&apos;t find that booking.</p>
          <Button nativeButton={false} variant="outline" render={<Link href="/bookings" />}>
            View your trips
          </Button>
        </div>
      </Centered>
    );
  }

  if (isPending) {
    return (
      <Centered>
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </Centered>
    );
  }

  const confirmed = booking.status === "CONFIRMED";

  return (
    <Centered>
      <Link
        href="/"
        className="mb-7 flex items-center gap-2 text-[19px] font-semibold tracking-tight"
      >
        <span className="inline-block size-2.5 rounded-full bg-primary" />
        Perch
      </Link>

      <div className="w-full max-w-[440px]">
        <Card className="px-8 pt-9 pb-8 text-center">
          <div className="mx-auto mb-5 flex size-13 items-center justify-center rounded-full border border-border bg-muted">
            <Check className="size-6" strokeWidth={1.75} />
          </div>
          <h1 className="mb-1.5 text-[23px] font-semibold tracking-tight">
            {confirmed ? "Booking confirmed" : "Booking received"}
          </h1>
          <p className="mb-[22px] text-sm text-muted-foreground text-pretty">
            {confirmed
              ? "We've emailed your itinerary and receipt. The host will reach out before check-in."
              : "We've emailed your receipt. You'll be charged once the host confirms your stay."}
          </p>

          <div className="mb-6 flex items-center justify-center gap-2">
            <span className="font-mono text-xs tracking-wide text-muted-foreground uppercase">
              Confirmation
            </span>
            <span className="rounded-full border border-border px-2.5 py-0.5 font-mono text-[13px] font-medium">
              {booking.id.slice(0, 8).toUpperCase()}
            </span>
          </div>

          <div className="overflow-hidden rounded-lg border border-border text-left">
            <div className="flex gap-3.5 border-b border-border p-3.5">
              <div
                className="flex size-16 shrink-0 items-center justify-center rounded-md"
                style={{ backgroundImage: PHOTO_STRIPES }}
              >
                {booking.property.images[0] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={photoUrl(booking.property.images[0])}
                    alt={booking.property.title}
                    className="size-full rounded-md object-cover"
                  />
                ) : (
                  <span className="font-mono text-[9px] text-muted-foreground">photo</span>
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[15px] font-semibold">{booking.property.title}</div>
                <div className="mt-0.5 text-[13px] text-muted-foreground">
                  {booking.property.city}
                </div>
                <div className="mt-1.5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
                  <Calendar className="size-[13px]" />
                  {formatRange(booking.checkIn, booking.checkOut)} · {booking.guests}{" "}
                  {booking.guests === 1 ? "guest" : "guests"}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between p-3.5">
              <span className="text-sm text-muted-foreground">
                {confirmed ? "Total paid" : "Total due"}
              </span>
              <span className="text-base font-semibold">{formatPrice(booking.totalPrice)}</span>
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-2.5">
            <Button
              nativeButton={false}
              size="lg"
              className="w-full"
              render={<Link href={`/bookings`} />}
            >
              View booking
            </Button>
            <Button
              nativeButton={false}
              variant="outline"
              size="lg"
              className="w-full"
              render={<Link href="/" />}
            >
              Back to home
            </Button>
          </div>
        </Card>

        <p className="mt-[22px] text-center text-[13px] text-muted-foreground">
          Need help?{" "}
          <Link href="#" className="font-medium text-foreground">
            Contact support
          </Link>
        </p>
      </div>
    </Centered>
  );
}
