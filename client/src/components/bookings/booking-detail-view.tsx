"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Users, Phone, Mail, User } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { CancelBookingDialog } from "@/components/bookings/cancel-booking-dialog";
import { bookingApi, type BookingDetail, type BookingStatus } from "@/lib/api/bookings";
import { paymentStatusLabel } from "@/lib/api/labels";
import { formatPrice } from "@/lib/utils/money";
import { formatStreetAddress } from "@/lib/utils/address";
import { PHOTO_STRIPES, photoUrl } from "@/lib/utils/photo";
import { formatRange, isoToLocalDate } from "@/lib/utils/dates";
import {
  calculateRefundPreview,
  FULL_REFUND_AFTER_HOURS,
  PARTIAL_REFUND_AFTER_HOURS,
} from "@/lib/utils/refund";
import { queryKeys } from "@/lib/query/keys";

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function statusBadge(status: BookingStatus) {
  switch (status) {
    case "CONFIRMED":
      return { variant: "default" as const, label: "Confirmed" };
    case "PENDING":
      return { variant: "outline" as const, label: "Awaiting host" };
    case "COMPLETED":
      return { variant: "secondary" as const, label: "Completed" };
    case "CANCELLED":
      return { variant: "destructive" as const, label: "Cancelled" };
  }
}

function formatFullDate(date: Date): string {
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

export function BookingDetailView({ id }: { id: string }) {
  const queryClient = useQueryClient();

  const {
    data: booking,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.bookings.detail(id),
    queryFn: () => bookingApi.byId(id),
  });

  const cancelMutation = useMutation({
    mutationFn: () => bookingApi.cancel(id),
    onSuccess: (result) => {
      const { cancellation } = result;
      if (cancellation && cancellation.refundPercent > 0) {
        toast.success(
          `Booking cancelled — ${cancellation.refundPercent}% refund (${formatPrice(cancellation.refundAmount)}) is on its way.`,
        );
      } else if (cancellation) {
        toast.success("Booking cancelled. No refund applies this close to check-in.");
      } else {
        toast.success("Booking cancelled");
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.detail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  if (isError) {
    return (
      <div className="flex flex-1 flex-col">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-[760px] flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
          <p className="text-sm text-destructive">{(error as Error).message}</p>
          <div className="flex gap-3">
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
            <Button
              nativeButton={false}
              variant="outline"
              size="sm"
              render={<Link href="/bookings" />}
            >
              Back to trips
            </Button>
          </div>
        </main>
      </div>
    );
  }

  if (isPending) {
    return (
      <div className="flex flex-1 flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-[760px] px-6 pt-10 pb-16">
          <div className="flex flex-col gap-4">
            <div className="h-8 w-1/2 animate-pulse rounded bg-muted" />
            <div className="h-5 w-1/3 animate-pulse rounded bg-muted" />
            <div className="h-[120px] animate-pulse rounded-xl bg-muted" />
            <div className="h-[160px] animate-pulse rounded-xl bg-muted" />
          </div>
        </main>
      </div>
    );
  }

  return (
    <BookingDetailBody
      booking={booking}
      onCancel={() => cancelMutation.mutate()}
      cancelling={cancelMutation.isPending}
    />
  );
}

function BookingDetailBody({
  booking,
  onCancel,
  cancelling,
}: {
  booking: BookingDetail;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const badge = statusBadge(booking.status);
  const isUpcoming = booking.status === "PENDING" || booking.status === "CONFIRMED";
  const preview =
    booking.status === "CONFIRMED"
      ? calculateRefundPreview(booking.checkIn, booking.totalPrice)
      : null;
  const zeroRefund = preview !== null && preview.refundPercent === 0;
  const canCancel = isUpcoming && !zeroRefund;

  const checkInDateTime = new Date(booking.checkIn);
  const fullRefundDeadline = new Date(
    checkInDateTime.getTime() - FULL_REFUND_AFTER_HOURS * 60 * 60 * 1000,
  );
  const partialRefundDeadline = new Date(
    checkInDateTime.getTime() - PARTIAL_REFUND_AFTER_HOURS * 60 * 60 * 1000,
  );

  const owner = booking.property.owner;

  const refund =
    booking.payment?.refundedAmount != null
      ? {
          amount: booking.payment.refundedAmount,
          percent: Math.round(
            (Number(booking.payment.refundedAmount) / Number(booking.payment.amount)) * 100,
          ),
        }
      : null;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[760px] px-6 pt-10 pb-16">
        <Button
          nativeButton={false}
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2"
          render={<Link href="/bookings" />}
        >
          Your trips
        </Button>

        <div className="mb-1 flex items-center gap-2.5">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          <span className="font-mono text-xs text-muted-foreground">
            #{booking.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
        <h1 className="mb-1 text-3xl font-semibold tracking-tight">
          Your trip to {booking.property.city}
        </h1>
        <p className="mb-8 text-[15px] text-muted-foreground">
          {formatRange(booking.checkIn, booking.checkOut)}
        </p>

        {booking.pendingHostCancellation ? (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
            <p className="font-medium text-amber-700 dark:text-amber-400">
              Your host has requested to cancel this booking. If approved, you&apos;ll be
              refunded in full — no action needed.
            </p>
          </div>
        ) : null}

        <Card className="mb-6 p-3.5">
          <Link href={`/properties/${booking.property.id}`} className="flex items-stretch gap-4">
            <div
              className="flex h-[104px] w-[130px] flex-none items-center justify-center rounded-lg"
              style={{ backgroundImage: PHOTO_STRIPES }}
            >
              {booking.property.images[0] ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={photoUrl(booking.property.images[0])}
                  alt={booking.property.title}
                  className="size-full rounded-lg object-cover"
                />
              ) : (
                <span className="font-mono text-[11px] text-muted-foreground">no photo</span>
              )}
            </div>
            <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
              <div className="text-[17px] font-semibold tracking-tight">
                {booking.property.title}
              </div>
              <span className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                <MapPin className="size-3.5" />
                {booking.property.city}
              </span>
            </div>
          </Link>
        </Card>

        <section className="mb-6 rounded-xl border border-border p-5">
          <h2 className="mb-4 text-[17px] font-semibold tracking-tight">Trip details</h2>
          <dl className="flex flex-col gap-3 text-sm">
            <DetailRow label="Check-in" value={formatFullDate(isoToLocalDate(booking.checkIn))} />
            <DetailRow
              label="Check-out"
              value={formatFullDate(isoToLocalDate(booking.checkOut))}
            />
            <DetailRow
              label="Guests"
              value={`${booking.guests} ${booking.guests === 1 ? "guest" : "guests"}`}
              icon={<Users className="size-3.5" />}
            />
            <DetailRow label="Address" value={formatStreetAddress(booking.property)} />
          </dl>
        </section>

        <section className="mb-6 rounded-xl border border-border p-5">
          <h2 className="mb-4 text-[17px] font-semibold tracking-tight">Your host</h2>
          <div className="flex items-center gap-3.5">
            <Avatar className="size-12">
              {owner.avatarUrl ? <AvatarImage src={owner.avatarUrl} alt="" /> : null}
              <AvatarFallback>
                {initials(owner.firstName, owner.lastName) || <User className="size-5" />}
              </AvatarFallback>
            </Avatar>
            <Link href={`/hosts/${owner.id}`} className="text-sm font-semibold hover:underline">
              {owner.firstName} {owner.lastName}
            </Link>
          </div>

          {booking.hostContact ? (
            <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 text-sm">
              {booking.hostContact.phoneNumber ? (
                <a
                  href={`tel:${booking.hostContact.phoneNumber}`}
                  className="inline-flex items-center gap-2 hover:underline"
                >
                  <Phone className="size-3.5 text-muted-foreground" />
                  {booking.hostContact.phoneNumber}
                </a>
              ) : null}
              <a
                href={`mailto:${booking.hostContact.email}`}
                className="inline-flex items-center gap-2 hover:underline"
              >
                <Mail className="size-3.5 text-muted-foreground" />
                {booking.hostContact.email}
              </a>
            </div>
          ) : booking.status === "PENDING" ? (
            <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
              Host contact appears once your booking is confirmed.
            </p>
          ) : booking.status === "CONFIRMED" ? (
            <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
              Host contact appears {FULL_REFUND_AFTER_HOURS / 24} days before check-in.
            </p>
          ) : null}
        </section>

        <section className="mb-6 rounded-xl border border-border p-5">
          <h2 className="mb-4 text-[17px] font-semibold tracking-tight">Payment</h2>
          <dl className="flex flex-col gap-3 text-sm">
            <DetailRow label="Total price" value={formatPrice(booking.totalPrice)} />
            {booking.payment ? (
              <DetailRow
                label="Payment status"
                value={paymentStatusLabel(booking.payment.status)}
              />
            ) : null}
            {refund ? (
              <DetailRow
                label="Refunded"
                value={`${formatPrice(refund.amount)} (${refund.percent}%)`}
              />
            ) : null}
          </dl>
        </section>

        <section className="mb-6 rounded-xl border border-border p-5">
          <h2 className="mb-4 text-[17px] font-semibold tracking-tight">Cancellation policy</h2>
          <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            <li>100% refund until {formatFullDate(fullRefundDeadline)}</li>
            <li>50% refund until {formatFullDate(partialRefundDeadline)}</li>
            <li>No refund after that</li>
          </ul>
        </section>

        {canCancel ? (
          <CancelBookingDialog
            propertyTitle={booking.property.title}
            checkIn={booking.checkIn}
            totalPrice={booking.totalPrice}
            status={booking.status}
            onConfirm={onCancel}
            cancelling={cancelling}
            triggerClassName="w-[140px]"
          />
        ) : isUpcoming && zeroRefund ? (
          <p className="text-sm text-muted-foreground">Free cancellation ended · non-refundable</p>
        ) : null}
      </main>
    </div>
  );
}

function DetailRow({
  label,
  value,
  muted,
  icon,
}: {
  label: string;
  value: string;
  muted?: boolean;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className={muted ? "text-right text-muted-foreground" : "text-right font-medium"}>
        {value}
      </dd>
    </div>
  );
}
