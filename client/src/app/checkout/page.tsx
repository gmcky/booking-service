"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Lock,
  Minus,
  Plus,
  CreditCard,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { propertyApi } from "@/lib/api/properties";
import { bookingApi } from "@/lib/api/bookings";
import { formatPrice } from "@/lib/utils/money";
import { PHOTO_STRIPES, photoUrl } from "@/lib/utils/photo";
import { nightsBetween, formatRange } from "@/lib/utils/dates";
import { queryKeys } from "@/lib/query/keys";

export default function CheckoutPage() {
  return (
    <React.Suspense fallback={<CheckoutFallback />}>
      <CheckoutInner />
    </React.Suspense>
  );
}

function CheckoutFallback() {
  return (
    <div className="mx-auto w-full max-w-[1080px] px-6 py-16">
      <div className="h-8 w-1/3 animate-pulse rounded bg-muted" />
    </div>
  );
}

function CheckoutInner() {
  const router = useRouter();
  const params = useSearchParams();
  const propertyId = params.get("propertyId") ?? "";
  const checkIn = params.get("checkIn") ?? "";
  const checkOut = params.get("checkOut") ?? "";
  const initialGuests = Number(params.get("guests") ?? "1") || 1;

  const [guests, setGuests] = React.useState(initialGuests);
  const [cardName, setCardName] = React.useState("");
  const [zip, setZip] = React.useState("");
  const [nameError, setNameError] = React.useState("");
  const [zipError, setZipError] = React.useState("");
  const [outcome, setOutcome] = React.useState<"success" | "declined">("success");
  const [forcedDecline, setForcedDecline] = React.useState(false);

  const propertyQuery = useQuery({
    queryKey: queryKeys.properties.detail(propertyId),
    queryFn: () => propertyApi.byId(propertyId),
    enabled: Boolean(propertyId),
  });

  const property = propertyQuery.data;

  React.useEffect(() => {
    if (!property) return;
    setGuests((g) => Math.min(Math.max(g, 1), property.maxGuests));
  }, [property]);

  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async () => {
      const effectiveGuests = property ? Math.min(Math.max(guests, 1), property.maxGuests) : guests;
      const booking = await bookingApi.create({
        propertyId,
        checkIn,
        checkOut,
        guests: effectiveGuests,
      });
      await bookingApi.createPaymentIntent(booking.id).catch(() => null);
      return booking;
    },
    onSuccess: (booking) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      router.push(`/confirmation?bookingId=${booking.id}`);
    },
  });

  if (!propertyId || !checkIn || !checkOut) {
    return (
      <div className="mx-auto flex w-full max-w-[1080px] flex-col items-center gap-4 px-6 py-24 text-center">
        <p className="text-sm text-muted-foreground">Missing trip details.</p>
        <Button nativeButton={false} variant="outline" render={<Link href="/browse" />}>
          Find a stay
        </Button>
      </div>
    );
  }

  const nights = nightsBetween(checkIn, checkOut);
  const subtotal = property ? nights * Number(property.pricePerNight) : 0;

  function onConfirm() {
    const nextNameError = cardName.trim() ? "" : "Enter the name on your card.";
    const nextZipError = zip.trim() ? "" : "Enter your billing ZIP.";
    setNameError(nextNameError);
    setZipError(nextZipError);
    if (nextNameError || nextZipError) return;
    if (outcome === "declined") {
      mutation.reset();
      setForcedDecline(true);
      return;
    }
    setForcedDecline(false);
    mutation.mutate();
  }

  const payError = forcedDecline
    ? "Your card was declined. Check the details or try a different payment method."
    : mutation.isError
      ? (mutation.error as Error).message
      : "";
  const paying = mutation.isPending;

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-[1080px] items-center gap-4 px-6">
          <Link href="/" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
            <span className="inline-block size-2.5 rounded-full bg-primary" />
            Perch
          </Link>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Lock className="size-3.5" />
            Secure checkout
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1080px] px-6 pt-7">
        <Link
          href={`/properties/${propertyId}`}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-[15px]" />
          Back to listing
        </Link>
        <h1 className="mb-7 text-[27px] font-semibold tracking-tight">Confirm and pay</h1>

        <div className="grid items-start gap-14 lg:grid-cols-[1fr_380px]">
          <div className="min-w-0">
            <section className="border-b border-border pb-6">
              <h2 className="mb-3.5 text-[17px] font-semibold tracking-tight">Your trip</h2>
              <div className="flex items-start justify-between gap-4 py-1">
                <div>
                  <div className="text-sm font-medium">Dates</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {formatRange(checkIn, checkOut)} · {nights} {nights === 1 ? "night" : "nights"}
                  </div>
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 pt-3">
                <div>
                  <div className="text-sm font-medium">Guests</div>
                  <div className="mt-0.5 text-sm text-muted-foreground">
                    {guests} {guests === 1 ? "guest" : "guests"}
                  </div>
                </div>
                <div className="flex items-center overflow-hidden rounded-full border border-border">
                  <button
                    type="button"
                    aria-label="Fewer guests"
                    onClick={() => setGuests((g) => Math.max(1, g - 1))}
                    className="flex size-[34px] items-center justify-center disabled:opacity-40"
                    disabled={guests <= 1}
                  >
                    <Minus className="size-[15px]" />
                  </button>
                  <span className="min-w-6 text-center font-mono text-sm">{guests}</span>
                  <button
                    type="button"
                    aria-label="More guests"
                    onClick={() =>
                      setGuests((g) => Math.min(property?.maxGuests ?? g + 1, g + 1))
                    }
                    className="flex size-[34px] items-center justify-center disabled:opacity-40"
                    disabled={Boolean(property) && guests >= property!.maxGuests}
                  >
                    <Plus className="size-[15px]" />
                  </button>
                </div>
              </div>
            </section>

            <section className="pt-6">
              <h2 className="mb-4 text-[17px] font-semibold tracking-tight">Pay with</h2>

              <div className="mb-4 flex flex-col gap-1.5">
                <Label htmlFor="co-name">Cardholder name</Label>
                <Input
                  id="co-name"
                  placeholder="Name on card"
                  value={cardName}
                  onChange={(e) => {
                    setCardName(e.target.value);
                    setNameError("");
                  }}
                  aria-invalid={Boolean(nameError)}
                />
                {nameError ? <span className="text-[13px] text-destructive">{nameError}</span> : null}
              </div>

              <div className="mb-4 flex flex-col gap-1.5">
                <Label>Card information</Label>
                <div className="overflow-hidden rounded-lg border border-border bg-background">
                  <div className="flex h-[38px] items-center gap-2.5 border-b border-border px-3">
                    <CreditCard className="size-[18px] text-muted-foreground" />
                    <span className="font-mono text-[13px] text-muted-foreground">
                      {outcome === "declined" ? "4000 0000 0000 0002" : "4242 4242 4242 4242"}
                    </span>
                  </div>
                  <div className="flex">
                    <div className="flex h-[38px] flex-1 items-center border-r border-border px-3 font-mono text-[13px] text-muted-foreground">
                      MM / YY
                    </div>
                    <div className="flex h-[38px] flex-1 items-center px-3 font-mono text-[13px] text-muted-foreground">
                      CVC
                    </div>
                  </div>
                </div>
                <span className="mt-0.5 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Lock className="size-3" />
                  Secured by Stripe · this is a demo field
                </span>
              </div>

              <div className="flex flex-col gap-1.5">
                <Label htmlFor="co-zip">Billing ZIP</Label>
                <Input
                  id="co-zip"
                  placeholder="94016"
                  value={zip}
                  onChange={(e) => {
                    setZip(e.target.value);
                    setZipError("");
                  }}
                  aria-invalid={Boolean(zipError)}
                  className="max-w-40"
                />
                {zipError ? <span className="text-[13px] text-destructive">{zipError}</span> : null}
              </div>
            </section>
          </div>

          <aside className="lg:sticky lg:top-6">
            <Card className="p-5">
              <div className="flex gap-3.5 border-b border-border pb-[18px]">
                <div
                  className="flex size-20 shrink-0 items-center justify-center rounded-lg"
                  style={{ backgroundImage: PHOTO_STRIPES }}
                >
                  {property?.images[0] ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={photoUrl(property.images[0])}
                      alt={property.title}
                      className="size-full rounded-lg object-cover"
                    />
                  ) : (
                    <span className="font-mono text-[10px] text-muted-foreground">photo</span>
                  )}
                </div>
                <div className="min-w-0">
                  <div className="text-[15px] font-semibold">
                    {property?.title ?? "Loading…"}
                  </div>
                  <div className="mt-0.5 text-[13px] text-muted-foreground">{property?.city}</div>
                </div>
              </div>

              <div className="flex flex-col gap-2.5 border-b border-border py-[18px] text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">
                    {property ? formatPrice(property.pricePerNight) : "—"} × {nights}{" "}
                    {nights === 1 ? "night" : "nights"}
                  </span>
                  <span>{formatPrice(subtotal)}</span>
                </div>
              </div>

              <div className="flex justify-between py-4 text-base font-semibold">
                <span>Total (USD)</span>
                <span>{formatPrice(subtotal)}</span>
              </div>

              {payError ? (
                <div className="mb-1 flex items-start gap-2.5 rounded-lg border border-destructive p-3 text-[13px] leading-snug text-destructive">
                  <AlertCircle className="mt-px size-[15px] shrink-0" />
                  <span>{payError}</span>
                </div>
              ) : null}

              <Button
                size="lg"
                className="mt-3 w-full"
                disabled={paying || !property}
                onClick={onConfirm}
              >
                {paying ? (
                  <>
                    <Loader2 className="mr-2 animate-spin" />
                    Processing…
                  </>
                ) : (
                  `Confirm and pay · ${formatPrice(subtotal)}`
                )}
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground text-pretty">
                You won&apos;t be charged until the host confirms. Free cancellation for 48 hours.
              </p>

              <div className="mt-4 flex items-center justify-center gap-2.5 border-t border-border pt-3.5">
                <span className="font-mono text-[11px] text-muted-foreground">Demo outcome</span>
                <div className="flex gap-0.5 rounded-lg bg-muted p-0.5">
                  <SegButton active={outcome === "success"} onClick={() => setOutcome("success")}>
                    Success
                  </SegButton>
                  <SegButton active={outcome === "declined"} onClick={() => setOutcome("declined")}>
                    Declined
                  </SegButton>
                </div>
              </div>
            </Card>
          </aside>
        </div>
      </main>
    </div>
  );
}

function SegButton({
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
      className={`rounded-md px-2.5 py-1 text-xs font-medium ${
        active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}
