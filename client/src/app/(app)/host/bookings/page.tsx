"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Calendar, Users, ChevronDown, Check, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { bookingApi, type HostBooking, type HostBookingQuery } from "@/lib/api/bookings";
import { propertyApi } from "@/lib/api/properties";
import { formatPrice } from "@/lib/utils/money";
import { PHOTO_STRIPES, photoUrl } from "@/lib/utils/photo";
import { formatRange } from "@/lib/utils/dates";
import { queryKeys } from "@/lib/query/keys";
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

type StatusFilter = "ALL" | NonNullable<HostBookingQuery["status"]>;

const STATUS_TABS: { value: StatusFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "PENDING", label: "Pending" },
  { value: "CONFIRMED", label: "Confirmed" },
  { value: "COMPLETED", label: "Completed" },
  { value: "CANCELLED", label: "Cancelled" },
];

export default function HostBookingsPage() {
  const [status, setStatus] = React.useState<StatusFilter>("ALL");
  const [propertyId, setPropertyId] = React.useState<string>("");
  const queryClient = useQueryClient();

  const query: HostBookingQuery = {
    status: status === "ALL" ? undefined : status,
    propertyId: propertyId || undefined,
  };

  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.bookings.host({ status: query.status, propertyId: query.propertyId }),
    queryFn: () => bookingApi.host(query),
  });

  const { data: properties } = useQuery({
    queryKey: queryKeys.properties.mine,
    queryFn: () => propertyApi.mine(),
  });

  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: "CONFIRMED" | "COMPLETED" }) =>
      bookingApi.updateStatus(id, status),
    onSuccess: (_, variables) => {
      toast.success(
        variables.status === "CONFIRMED" ? "Reservation confirmed" : "Marked as completed",
      );
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const declineMutation = useMutation({
    mutationFn: (id: string) => bookingApi.declinePending(id),
    onSuccess: () => {
      toast.success("Reservation declined. The guest was refunded in full");
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const anyBusy = statusMutation.isPending || declineMutation.isPending;
  const bookings = data?.data ?? [];
  const count = data?.pagination.total ?? bookings.length;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1120px] px-6 pt-10">
        <h1 className="mb-1 text-3xl font-semibold tracking-tight">Reservations</h1>
        <p className="mb-6 text-[15px] text-muted-foreground">
          {isPending ? "Loading reservations…" : `${count} ${count === 1 ? "reservation" : "reservations"}`}
        </p>

        <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-border">
          <div className="flex gap-6">
            {STATUS_TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => setStatus(t.value)}
                className={`relative py-3.5 text-sm font-medium transition-colors ${
                  status === t.value
                    ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <span className="relative flex items-center pb-3.5">
            <select
              value={propertyId}
              onChange={(e) => setPropertyId(e.target.value)}
              className="h-8 w-[220px] cursor-pointer appearance-none rounded-lg border border-border bg-background pr-7 pl-3 text-sm outline-none"
            >
              <option value="">All properties</option>
              {(properties?.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-2 size-[15px] text-muted-foreground" />
          </span>
        </div>

        {isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-destructive">{(error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : isPending ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-[168px] animate-pulse rounded-xl border border-border bg-muted/40" />
            ))}
          </div>
        ) : bookings.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="flex flex-col gap-4">
            {bookings.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                onConfirm={() => statusMutation.mutate({ id: b.id, status: "CONFIRMED" })}
                onComplete={() => statusMutation.mutate({ id: b.id, status: "COMPLETED" })}
                onDecline={() => declineMutation.mutate(b.id)}
                busy={
                  (statusMutation.isPending && statusMutation.variables?.id === b.id) ||
                  (declineMutation.isPending && declineMutation.variables === b.id)
                }
                disabled={anyBusy}
              />
            ))}
          </div>
        )}

        <SiteFooter />
      </main>
    </div>
  );
}

function statusBadge(b: HostBooking) {
  switch (b.status) {
    case "CONFIRMED":
      return { variant: "default" as const, label: "Confirmed" };
    case "PENDING":
      return { variant: "outline" as const, label: "Pending" };
    case "COMPLETED":
      return { variant: "secondary" as const, label: "Completed" };
    case "CANCELLED":
      return { variant: "destructive" as const, label: "Cancelled" };
  }
}

function BookingRow({
  booking,
  onConfirm,
  onComplete,
  onDecline,
  busy,
  disabled,
}: {
  booking: HostBooking;
  onConfirm: () => void;
  onComplete: () => void;
  onDecline: () => void;
  busy: boolean;
  // busy drives the spinner on the acting row; disabled gates every row while
  // any status PATCH is in flight — the mutation instance is shared, so
  // `variables` (and thus busy) flips to the latest call mid-flight.
  disabled: boolean;
}) {
  const badge = statusBadge(booking);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [declineOpen, setDeclineOpen] = React.useState(false);
  const canComplete = booking.status === "CONFIRMED" && new Date(booking.checkOut) <= new Date();

  return (
    <Card className="p-3.5 transition-[border-color,box-shadow] hover:border-ring hover:shadow-sm">
      <div className="flex items-stretch gap-[18px] max-sm:flex-col">
        <div
          className="relative flex h-[140px] w-[168px] flex-none items-center justify-center rounded-lg max-sm:h-40 max-sm:w-full"
          style={{ backgroundImage: PHOTO_STRIPES }}
        >
          {booking.property.images[0] ? (
            <Image

              src={photoUrl(booking.property.images[0])}

              alt={booking.property.title}

              fill

              sizes="(max-width: 640px) 100vw, 168px"

              className="rounded-lg object-cover"

            />
          ) : (
            <span className="font-mono text-[11px] text-muted-foreground">no photo</span>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col justify-center gap-1.5">
          <div className="flex items-center gap-2.5">
            <Badge variant={badge.variant}>{badge.label}</Badge>
            <span className="font-mono text-xs text-muted-foreground">
              #{booking.id.slice(0, 8).toUpperCase()}
            </span>
          </div>
          <div className="text-[17px] font-semibold tracking-tight">{booking.property.title}</div>
          <div className="flex flex-wrap items-center gap-3.5 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-3.5" />
              {booking.property.city}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-3.5" />
              {formatRange(booking.checkIn, booking.checkOut)}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-3.5" />
              {booking.guests} {booking.guests === 1 ? "guest" : "guests"}
            </span>
          </div>
          <div className="mt-0.5 text-sm">
            <span className="text-muted-foreground">Guest</span>{" "}
            <strong className="font-semibold">
              {booking.user.firstName} {booking.user.lastName}
            </strong>
            <span className="mx-2 text-muted-foreground">·</span>
            <span className="text-muted-foreground">Total</span>{" "}
            <strong className="font-semibold">{formatPrice(booking.totalPrice)}</strong>
          </div>
        </div>

        <div className="flex flex-none flex-col items-end justify-center gap-2 max-sm:flex-row max-sm:justify-start">
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            className="w-[130px]"
            render={<Link href={`/properties/${booking.propertyId}`} />}
          >
            View
          </Button>
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            className="w-[130px]"
            render={<Link href={`/host/bookings/${booking.id}`} />}
          >
            Manage
          </Button>
          {booking.status === "PENDING" ? (
            <>
              <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <AlertDialogTrigger
                  render={
                    <Button variant="default" size="sm" className="w-[130px]" disabled={disabled} />
                  }
                >
                  {busy ? <Loader2 className="animate-spin" /> : <Check />}
                  Confirm
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Confirm this reservation?</AlertDialogTitle>
                    <AlertDialogDescription>
                      You're accepting {booking.user.firstName} {booking.user.lastName}'s stay at{" "}
                      {booking.property.title}. The guest's payment is captured and the dates are
                      locked on your calendar. After confirming, cancelling needs admin approval and
                      refunds the guest in full. Only confirm if you're sure you can host.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Not yet</AlertDialogCancel>
                    <AlertDialogAction
                      onClick={() => {
                        // AlertDialogAction is a plain Button (no Close): close
                        // explicitly so a pending mutation can't be double-fired.
                        setConfirmOpen(false);
                        onConfirm();
                      }}
                    >
                      Confirm reservation
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog open={declineOpen} onOpenChange={setDeclineOpen}>
                <AlertDialogTrigger
                  render={
                    <Button variant="outline" size="sm" className="w-[130px]" disabled={disabled} />
                  }
                >
                  Decline
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Decline this reservation?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This declines {booking.user.firstName} {booking.user.lastName}'s request for{" "}
                      {booking.property.title} and refunds the guest in full. The dates stay open
                      for other guests. This can't be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Not yet</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => {
                        setDeclineOpen(false);
                        onDecline();
                      }}
                    >
                      Decline reservation
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          ) : canComplete ? (
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogTrigger
                render={
                  <Button variant="outline" size="sm" className="w-[130px]" disabled={disabled} />
                }
              >
                {busy ? <Loader2 className="animate-spin" /> : <Check />}
                Mark completed
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mark this stay as completed?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This marks the reservation at {booking.property.title} as completed.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Not yet</AlertDialogCancel>
                  <AlertDialogAction
                    onClick={() => {
                      // AlertDialogAction is a plain Button (no Close): close
                      // explicitly so a pending mutation can't be double-fired.
                      setConfirmOpen(false);
                      onComplete();
                    }}
                  >
                    Mark completed
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border px-6 py-18 text-center">
      <div className="mb-4 flex size-13 items-center justify-center rounded-full border border-border text-muted-foreground">
        <Calendar className="size-5" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">No reservations yet</h2>
      <p className="mt-1.5 max-w-[320px] text-sm text-muted-foreground text-pretty">
        Bookings on your listings will show up here once guests start reserving.
      </p>
    </div>
  );
}
