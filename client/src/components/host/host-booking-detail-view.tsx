"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MapPin, Users, Phone, Mail, User } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { bookingApi, type HostBookingDetail, type BookingStatus } from "@/lib/api/bookings";
import { paymentStatusLabel } from "@/lib/api/labels";
import { formatPrice } from "@/lib/utils/money";
import { PHOTO_STRIPES, photoUrl } from "@/lib/utils/photo";
import { formatRange, isoToLocalDate } from "@/lib/utils/dates";
import { queryKeys } from "@/lib/query/keys";

const MIN_REASON_LENGTH = 10;

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

function statusBadge(status: BookingStatus) {
  switch (status) {
    case "CONFIRMED":
      return { variant: "default" as const, label: "Confirmed" };
    case "PENDING":
      return { variant: "outline" as const, label: "Awaiting payment" };
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

export function HostBookingDetailView({ id }: { id: string }) {
  const queryClient = useQueryClient();

  const {
    data: booking,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.bookings.hostDetail(id),
    queryFn: () => bookingApi.hostView(id),
  });

  const requestCancelMutation = useMutation({
    mutationFn: (reason: string) => bookingApi.requestHostCancel(id, reason),
    onSuccess: () => {
      toast.success("Cancellation request submitted for review");
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.hostDetail(id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const declineMutation = useMutation({
    mutationFn: () => bookingApi.declinePending(id),
    onSuccess: () => {
      toast.success("Reservation declined. The guest was refunded in full");
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.hostDetail(id) });
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
              render={<Link href="/host/bookings" />}
            >
              All reservations
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
    <HostBookingDetailBody
      booking={booking}
      onRequestCancel={(reason) => requestCancelMutation.mutate(reason)}
      requesting={requestCancelMutation.isPending}
      onDecline={() => declineMutation.mutate()}
      declining={declineMutation.isPending}
    />
  );
}

function HostBookingDetailBody({
  booking,
  onRequestCancel,
  requesting,
  onDecline,
  declining,
}: {
  booking: HostBookingDetail;
  onRequestCancel: (reason: string) => void;
  requesting: boolean;
  onDecline: () => void;
  declining: boolean;
}) {
  const badge = statusBadge(booking.status);
  const cancellationRequest = booking.cancellationRequest;
  const isPendingRequest = cancellationRequest?.status === "PENDING";
  const canDecline = booking.status === "PENDING";
  const canRequestCancel =
    booking.status === "CONFIRMED" &&
    new Date(booking.checkIn) > new Date() &&
    !isPendingRequest;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[760px] px-6 pt-10 pb-16">
        <Button
          nativeButton={false}
          variant="ghost"
          size="sm"
          className="mb-4 -ml-2"
          render={<Link href="/host/bookings" />}
        >
          All reservations
        </Button>

        <div className="mb-1 flex items-center gap-2.5">
          <Badge variant={badge.variant}>{badge.label}</Badge>
          <span className="font-mono text-xs text-muted-foreground">
            #{booking.id.slice(0, 8).toUpperCase()}
          </span>
        </div>
        <h1 className="mb-1 text-3xl font-semibold tracking-tight">Reservation</h1>
        <p className="mb-8 text-[15px] text-muted-foreground">
          {booking.property.title} · {formatRange(booking.checkIn, booking.checkOut)}
        </p>

        <Card className="mb-6 p-3.5">
          <Link href={`/properties/${booking.property.id}`} className="flex items-stretch gap-4">
            <div
              className="relative flex h-[104px] w-[130px] flex-none items-center justify-center rounded-lg"
              style={{ backgroundImage: PHOTO_STRIPES }}
            >
              {booking.property.images[0] ? (
                <Image

                  src={photoUrl(booking.property.images[0])}

                  alt={booking.property.title}

                  fill

                  sizes="130px"

                  className="rounded-lg object-cover"

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
          <h2 className="mb-4 text-[17px] font-semibold tracking-tight">Guest</h2>
          <div className="flex items-center gap-3.5">
            <Avatar className="size-12">
              {booking.guest.avatarUrl ? (
                <AvatarImage src={booking.guest.avatarUrl} alt="" />
              ) : null}
              <AvatarFallback>
                {initials(booking.guest.firstName, booking.guest.lastName) || (
                  <User className="size-5" />
                )}
              </AvatarFallback>
            </Avatar>
            <span className="text-sm font-semibold">
              {booking.guest.firstName} {booking.guest.lastName}
            </span>
          </div>

          {booking.guest.contact ? (
            <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 text-sm">
              <a
                href={`mailto:${booking.guest.contact.email}`}
                className="inline-flex items-center gap-2 hover:underline"
              >
                <Mail className="size-3.5 text-muted-foreground" />
                {booking.guest.contact.email}
              </a>
              {booking.guest.contact.phoneNumber ? (
                <a
                  href={`tel:${booking.guest.contact.phoneNumber}`}
                  className="inline-flex items-center gap-2 hover:underline"
                >
                  <Phone className="size-3.5 text-muted-foreground" />
                  {booking.guest.contact.phoneNumber}
                </a>
              ) : null}
            </div>
          ) : (
            <p className="mt-4 border-t border-border pt-4 text-sm text-muted-foreground">
              Guest contact unlocks once the booking is confirmed.
            </p>
          )}

          <Button variant="outline" size="sm" className="mt-4" disabled>
            Message guest · coming soon
          </Button>
        </section>

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
          </dl>
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
            {booking.payment?.refundedAmount ? (
              <DetailRow
                label="Refunded"
                value={`${formatPrice(booking.payment.refundedAmount)} (${Math.round(
                  (Number(booking.payment.refundedAmount) / Number(booking.payment.amount)) * 100,
                )}%)`}
              />
            ) : null}
          </dl>
        </section>

        <section className="rounded-xl border border-border p-5">
          <h2 className="mb-4 text-[17px] font-semibold tracking-tight">Cancellation</h2>

          {isPendingRequest ? (
            <div className="mb-4 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm">
              <p className="font-medium text-amber-700 dark:text-amber-400">
                Cancellation request under review. The guest will be refunded in full if
                approved.
              </p>
              <p className="mt-1.5 text-muted-foreground">{cancellationRequest?.reason}</p>
            </div>
          ) : cancellationRequest?.status === "APPROVED" ? (
            <div className="mb-4 rounded-lg border border-border bg-muted/50 p-4 text-sm">
              This booking was cancelled at your request (guest fully refunded).
            </div>
          ) : cancellationRequest?.status === "REJECTED" ? (
            <p className="mb-4 text-sm text-muted-foreground">
              Your last cancellation request was declined.
            </p>
          ) : null}

          {canDecline ? (
            <>
              <p className="mb-3 text-sm text-muted-foreground">
                This reservation is still pending your confirmation. You can decline it now. The
                guest is refunded in full and the dates stay open for other guests.
              </p>
              <DeclineDialog
                onConfirm={onDecline}
                declining={declining}
                guestName={`${booking.guest.firstName} ${booking.guest.lastName}`}
              />
            </>
          ) : canRequestCancel ? (
            <RequestCancelDialog onConfirm={onRequestCancel} requesting={requesting} />
          ) : !isPendingRequest && cancellationRequest?.status !== "APPROVED" ? (
            <p className="text-sm text-muted-foreground">
              This reservation isn&apos;t eligible for a host-initiated cancellation.
            </p>
          ) : null}
        </section>
      </main>
    </div>
  );
}

function RequestCancelDialog({
  onConfirm,
  requesting,
}: {
  onConfirm: (reason: string) => void;
  requesting: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [reason, setReason] = React.useState("");
  const canSubmit = reason.trim().length >= MIN_REASON_LENGTH;

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setReason("");
      }}
    >
      <AlertDialogTrigger
        render={
          <Button variant="destructive" size="sm" className="w-[200px]" disabled={requesting} />
        }
      >
        Request cancellation
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Request cancellation?</AlertDialogTitle>
          <AlertDialogDescription>
            Cancelling a confirmed booking needs admin approval and always refunds the guest in
            full.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <Textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why do you need to cancel this reservation?"
          className="min-h-24"
        />
        <AlertDialogFooter>
          <AlertDialogCancel>Never mind</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            disabled={!canSubmit}
            onClick={() => {
              // AlertDialogAction is a plain Button (no Close): close
              // explicitly so a pending mutation can't be double-fired.
              setOpen(false);
              onConfirm(reason.trim());
              setReason("");
            }}
          >
            Submit request
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DeclineDialog({
  onConfirm,
  declining,
  guestName,
}: {
  onConfirm: () => void;
  declining: boolean;
  guestName: string;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger
        render={
          <Button variant="destructive" size="sm" className="w-[200px]" disabled={declining} />
        }
      >
        Decline reservation
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Decline this reservation?</AlertDialogTitle>
          <AlertDialogDescription>
            This declines {guestName}'s request and refunds the guest in full. The dates stay open
            for other guests. This can't be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Never mind</AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            onClick={() => {
              setOpen(false);
              onConfirm();
            }}
          >
            Decline reservation
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function DetailRow({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="inline-flex items-center gap-1.5 text-muted-foreground">
        {icon}
        {label}
      </dt>
      <dd className="text-right font-medium">{value}</dd>
    </div>
  );
}
