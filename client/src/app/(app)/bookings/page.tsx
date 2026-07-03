"use client";

import * as React from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { MapPin, Calendar, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { bookingApi, type BookingListItem } from "@/lib/api/bookings";
import { formatPrice } from "@/lib/utils/money";
import { PHOTO_STRIPES, photoUrl } from "@/lib/utils/photo";
import { formatRange } from "@/lib/utils/dates";
import { calculateRefundPreview } from "@/lib/utils/refund";
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

type Tab = "upcoming" | "past" | "cancelled";

function categorize(b: BookingListItem): Tab {
  if (b.status === "CANCELLED") return "cancelled";
  if (b.status === "COMPLETED" || new Date(b.checkOut).getTime() < Date.now()) return "past";
  return "upcoming";
}

export default function BookingsPage() {
  const [tab, setTab] = React.useState<Tab>("upcoming");
  const queryClient = useQueryClient();

  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.bookings.all,
    queryFn: () => bookingApi.list(),
  });

  const cancelMutation = useMutation({
    mutationFn: (id: string) => bookingApi.cancel(id),
    onSuccess: (result, id) => {
      const wasPaid = data?.data.find((b) => b.id === id)?.status === "CONFIRMED";
      const { cancellation } = result;
      if (wasPaid && cancellation && cancellation.refundPercent > 0) {
        toast.success(
          `Booking cancelled — ${cancellation.refundPercent}% refund (${formatPrice(cancellation.refundAmount)}) is on its way.`,
        );
      } else if (wasPaid && cancellation) {
        toast.success("Booking cancelled. No refund applies this close to check-in.");
      } else {
        toast.success("Booking cancelled");
      }
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const grouped = React.useMemo(() => {
    const result: Record<Tab, BookingListItem[]> = { upcoming: [], past: [], cancelled: [] };
    for (const b of data?.data ?? []) result[categorize(b)].push(b);
    return result;
  }, [data]);

  const current = grouped[tab];
  const subtitle = isPending
    ? "Loading your trips…"
    : tab === "upcoming"
      ? `${grouped.upcoming.length} upcoming ${grouped.upcoming.length === 1 ? "reservation" : "reservations"}`
      : tab === "past"
        ? `${grouped.past.length} past ${grouped.past.length === 1 ? "stay" : "stays"}`
        : `${grouped.cancelled.length} cancelled ${grouped.cancelled.length === 1 ? "trip" : "trips"}`;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[920px] px-6 pt-10">
        <h1 className="mb-1 text-3xl font-semibold tracking-tight">Your trips</h1>
        <p className="mb-6 text-[15px] text-muted-foreground">{subtitle}</p>

        <div className="mb-6 flex gap-6 border-b border-border">
          {(["upcoming", "past", "cancelled"] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`relative py-3.5 text-sm font-medium capitalize transition-colors ${
                tab === t
                  ? "text-foreground after:absolute after:inset-x-0 after:-bottom-px after:h-0.5 after:bg-primary"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t}
            </button>
          ))}
        </div>

        {isError ? (
          <p className="py-16 text-center text-sm text-destructive">{(error as Error).message}</p>
        ) : isPending ? (
          <div className="flex flex-col gap-4">
            {Array.from({ length: 2 }).map((_, i) => (
              <div key={i} className="h-[168px] animate-pulse rounded-xl border border-border bg-muted/40" />
            ))}
          </div>
        ) : current.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <div className="flex flex-col gap-4">
            {current.map((b) => (
              <BookingRow
                key={b.id}
                booking={b}
                tab={tab}
                onCancel={() => cancelMutation.mutate(b.id)}
                cancelling={cancelMutation.isPending && cancelMutation.variables === b.id}
              />
            ))}
          </div>
        )}

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-border py-8">
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

function statusBadge(b: BookingListItem) {
  switch (b.status) {
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

function BookingRow({
  booking,
  tab,
  onCancel,
  cancelling,
}: {
  booking: BookingListItem;
  tab: Tab;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const badge = statusBadge(booking);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const preview =
    booking.status === "CONFIRMED"
      ? calculateRefundPreview(booking.checkIn, booking.totalPrice)
      : null;
  return (
    <Card className="p-3.5 transition-[border-color,box-shadow] hover:border-ring hover:shadow-sm">
      <div className="flex items-stretch gap-[18px] max-sm:flex-col">
        <div
          className="flex h-[140px] w-[168px] flex-none items-center justify-center rounded-lg max-sm:h-40 max-sm:w-full"
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
          </div>
          <div className="mt-0.5 text-sm">
            <span className="text-muted-foreground">Total</span>{" "}
            <strong className="font-semibold">{formatPrice(booking.totalPrice)}</strong>
          </div>
        </div>

        <div className="flex flex-none flex-col items-end justify-center gap-2 max-sm:flex-row max-sm:justify-start">
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            className="w-[100px]"
            render={<Link href={`/properties/${booking.propertyId}`} />}
          >
            View
          </Button>
          {tab === "upcoming" ? (
            <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
              <AlertDialogTrigger
                render={
                  <Button variant="destructive" size="sm" className="w-[100px]" disabled={cancelling} />
                }
              >
                {cancelling ? <Loader2 className="animate-spin" /> : <X />}
                Cancel
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Cancel this booking?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will cancel your reservation at {booking.property.title}. This can&apos;t be undone.
                    {preview ? (
                      <>
                        {" "}
                        {preview.refundPercent > 0
                          ? `You'll receive a ${preview.refundPercent}% refund (${formatPrice(preview.refundAmount)}).`
                          : "This is within 24 hours of check-in, so no refund applies."}
                      </>
                    ) : null}
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Keep booking</AlertDialogCancel>
                  <AlertDialogAction
                    variant="destructive"
                    onClick={() => {
                      // AlertDialogAction is a plain Button (no Close): close
                      // explicitly so a pending mutation can't be double-fired.
                      setConfirmOpen(false);
                      onCancel();
                    }}
                  >
                    Cancel booking
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          ) : tab === "past" ? (
            <Button
              nativeButton={false}
              variant="ghost"
              size="sm"
              className="w-[100px]"
              render={<Link href={`/properties/${booking.propertyId}`} />}
            >
              Book again
            </Button>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

function EmptyState({ tab }: { tab: Tab }) {
  const copy = {
    upcoming: {
      title: "No upcoming trips",
      body: "When you book a stay, it'll show up here with all the details.",
    },
    past: {
      title: "No past stays",
      body: "Your completed trips will be listed here once you've stayed somewhere.",
    },
    cancelled: {
      title: "No cancelled trips",
      body: "Trips you cancel will appear here, along with any refund details.",
    },
  }[tab];

  return (
    <div className="flex flex-col items-center rounded-xl border border-border px-6 py-18 text-center">
      <div className="mb-4 flex size-13 items-center justify-center rounded-full border border-border text-muted-foreground">
        <Calendar className="size-5" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">{copy.title}</h2>
      <p className="mt-1.5 max-w-[320px] text-sm text-muted-foreground text-pretty">{copy.body}</p>
      <Button nativeButton={false} variant="outline" size="sm" className="mt-5" render={<Link href="/browse" />}>
        Find a stay
      </Button>
    </div>
  );
}
