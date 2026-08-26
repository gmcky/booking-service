"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { Check, Calendar, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { bookingApi } from "@/lib/api/bookings";
import { paymentStatusLabel } from "@/lib/api/labels";
import { formatPrice } from "@/lib/utils/money";
import { PHOTO_STRIPES, photoUrl } from "@/lib/utils/photo";
import { formatRange } from "@/lib/utils/dates";
import { queryKeys } from "@/lib/query/keys";

/** Stop polling a still-pending booking after this window. */
const POLL_WINDOW_MS = 30_000;

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
  // Wall-clock timeout, flipped via state so the UI re-renders when it
  // expires. The refetchInterval callback runs on every observer evaluation,
  // not once per poll — a counter there over- or under-counts.
  const [timedOut, setTimedOut] = React.useState(false);

  const { data: booking, isPending, isError, refetch } = useQuery({
    queryKey: queryKeys.bookings.detail(bookingId),
    queryFn: () => bookingApi.byId(bookingId),
    enabled: Boolean(bookingId),
    refetchInterval: (query) =>
      query.state.data?.status === "PENDING" &&
      query.state.data?.payment?.status !== "FAILED" &&
      !timedOut
        ? 2000
        : false,
  });

  const status = booking?.status;
  React.useEffect(() => {
    if (status !== "PENDING" || timedOut) return;
    const t = setTimeout(() => setTimedOut(true), POLL_WINDOW_MS);
    return () => clearTimeout(t);
  }, [status, timedOut]);

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

  const paymentFailed = booking.payment?.status === "FAILED";
  const confirmed = booking.status === "CONFIRMED" || booking.status === "COMPLETED";
  const cancelled = booking.status === "CANCELLED";
  // A failed attempt leaves the booking PENDING and resumable; the cron sweep
  // releases it later. Only a CANCELLED booking is truly dead.
  const processing = booking.status === "PENDING" && !paymentFailed;
  const retryable = booking.status === "PENDING" && paymentFailed;

  const stalled = processing && timedOut;

  const heading = confirmed
    ? "Booking confirmed"
    : stalled
      ? "Still processing"
      : processing
        ? "Processing payment…"
        : "Payment failed";
  const body = confirmed
    ? "We've emailed your itinerary and receipt. The host will reach out before check-in."
    : stalled
      ? "This is taking longer than usual. Your payment is safe. We'll email you once the booking confirms, or you can check again now."
      : processing
        ? "Your payment is being confirmed. This can take a moment. It's safe to leave this page, we'll email you as soon as it's done."
        : retryable
          ? "Your payment didn't go through. You can try again."
          : "Your payment couldn't be completed and this booking was cancelled. You can try booking again.";

  return (
    <Centered>
      <Link
        href="/"
        className="mb-7 flex items-center gap-2 text-[19px] font-semibold tracking-tight"
      >
        <span className="inline-block size-2.5 rounded-full bg-primary" />
        GMCK Booking
      </Link>

      <div className="w-full max-w-[440px]">
        <Card className="px-8 pt-9 pb-8 text-center">
          <div className="mx-auto mb-5 flex size-13 items-center justify-center rounded-full border border-border bg-muted">
            {processing ? (
              <Loader2 className="size-6 animate-spin" strokeWidth={1.75} />
            ) : confirmed ? (
              <Check className="size-6" strokeWidth={1.75} />
            ) : (
              <X className="size-6" strokeWidth={1.75} />
            )}
          </div>
          <h1 className="mb-1.5 text-[23px] font-semibold tracking-tight">{heading}</h1>
          <p className="mb-[22px] text-sm text-muted-foreground text-pretty">{body}</p>

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
                className="relative flex size-16 shrink-0 items-center justify-center rounded-md"
                style={{ backgroundImage: PHOTO_STRIPES }}
              >
                {booking.property.images[0] ? (
                  <Image

                    src={photoUrl(booking.property.images[0])}

                    alt={booking.property.title}

                    fill

                    sizes="64px"

                    className="rounded-md object-cover"

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
            {booking.payment ? (
              <div className="flex items-center justify-between border-t border-border p-3.5">
                <span className="text-sm text-muted-foreground">Payment</span>
                <Badge variant={confirmed ? "secondary" : cancelled ? "destructive" : "outline"}>
                  {paymentStatusLabel(booking.payment.status)}
                </Badge>
              </div>
            ) : null}
          </div>

          <div className="mt-6 flex flex-col gap-2.5">
            {stalled ? (
              <Button
                size="lg"
                className="w-full"
                onClick={() => {
                  setTimedOut(false); // restarts the poll window
                  refetch();
                }}
              >
                Check again
              </Button>
            ) : retryable ? (
              <Button
                nativeButton={false}
                size="lg"
                className="w-full"
                render={<Link href={`/checkout?bookingId=${booking.id}`} />}
              >
                Try again
              </Button>
            ) : cancelled ? (
              <Button
                nativeButton={false}
                size="lg"
                className="w-full"
                render={<Link href={`/properties/${booking.property.id}`} />}
              >
                Try booking again
              </Button>
            ) : (
              <Button
                nativeButton={false}
                size="lg"
                className="w-full"
                render={<Link href={`/bookings/${booking.id}`} />}
              >
                View booking
              </Button>
            )}
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
          <Link href="/support" className="font-medium text-foreground">
            Contact support
          </Link>
        </p>
      </div>
    </Centered>
  );
}
