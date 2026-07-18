"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Elements, PaymentElement, useElements, useStripe } from "@stripe/react-stripe-js";
import { ArrowLeft, Lock, Minus, Plus, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { propertyApi } from "@/lib/api/properties";
import { bookingApi, type BookingWithProperty } from "@/lib/api/bookings";
import { useAuthStore } from "@/lib/auth/store";
import { getStripe } from "@/lib/stripe";
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

function ErrorBox({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-1 flex items-start gap-2.5 rounded-lg border border-destructive p-3 text-[13px] leading-snug text-destructive">
      <AlertCircle className="mt-px size-[15px] shrink-0" />
      <span>{children}</span>
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
  // Deep link from the trips page: resume payment for an existing PENDING
  // booking instead of creating a new one.
  const resumeBookingId = params.get("bookingId") ?? "";

  const [guests, setGuests] = React.useState(initialGuests);
  const [booking, setBooking] = React.useState<BookingWithProperty | null>(null);
  const [clientSecret, setClientSecret] = React.useState<string | null>(null);
  const [resumeError, setResumeError] = React.useState<string | null>(null);

  // Booking state is component-local, so back-nav or a remount would lose the
  // PENDING booking and a fresh create would 409 against it (own dates
  // overlap). Remember the booking id per trip and resume it instead.
  const resumeKey = `checkout:${propertyId}:${checkIn}:${checkOut}`;

  // In resume mode the property id comes from the loaded booking.
  const effectivePropertyId = propertyId || booking?.propertyId || "";

  const propertyQuery = useQuery({
    queryKey: queryKeys.properties.detail(effectivePropertyId),
    queryFn: () => propertyApi.byId(effectivePropertyId),
    enabled: Boolean(effectivePropertyId),
  });

  const property = propertyQuery.data;

  React.useEffect(() => {
    if (!property) return;
    setGuests((g) => Math.min(Math.max(g, 1), property.maxGuests));
  }, [property]);

  const queryClient = useQueryClient();

  const intentMutation = useMutation({
    mutationFn: (bookingId: string) => bookingApi.createPaymentIntent(bookingId),
    onSuccess: (data) => setClientSecret(data.clientSecret),
  });

  const bookingMutation = useMutation({
    mutationFn: async () => {
      const effectiveGuests = property ? Math.min(Math.max(guests, 1), property.maxGuests) : guests;
      return bookingApi.create({ propertyId, checkIn, checkOut, guests: effectiveGuests });
    },
    onSuccess: (b) => {
      setBooking(b);
      sessionStorage.setItem(resumeKey, b.id);
      queryClient.invalidateQueries({ queryKey: queryKeys.bookings.all });
      intentMutation.mutate(b.id);
    },
  });

  const authStatus = useAuthStore((s) => s.status);

  const resumedRef = React.useRef(false);
  React.useEffect(() => {
    if (resumedRef.current) return;
    // Wait for the session bootstrap before firing an authed call: a 401 here
    // mid-refresh races token rotation and gets the whole session revoked.
    if (authStatus !== "authed" && authStatus !== "anon") return;
    resumedRef.current = true;
    // Explicit deep link wins over the per-trip sessionStorage fallback.
    const storedId = resumeBookingId || sessionStorage.getItem(resumeKey);
    if (!storedId) return;
    bookingApi
      .byId(storedId)
      .then((b) => {
        if (b.status === "PENDING") {
          setBooking(b);
          setGuests(b.guests);
          intentMutation.mutate(b.id); // idempotent server-side, same clientSecret
        } else if (resumeBookingId) {
          setResumeError(
            b.status === "CANCELLED"
              ? "This booking was cancelled, so it can no longer be paid. Unpaid bookings are released at check-in, or after 24 hours."
              : "This booking is already confirmed. No payment is due.",
          );
        } else {
          sessionStorage.removeItem(resumeKey);
        }
      })
      .catch((err) => {
        if (resumeBookingId) {
          setResumeError(err instanceof Error ? err.message : "Booking not found.");
        } else {
          sessionStorage.removeItem(resumeKey);
        }
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authStatus]);

  function onContinue() {
    if (booking) {
      intentMutation.mutate(booking.id);
    } else {
      bookingMutation.mutate();
    }
  }

  if (!resumeBookingId && (!propertyId || !checkIn || !checkOut)) {
    return (
      <div className="mx-auto flex w-full max-w-[1080px] flex-col items-center gap-4 px-6 py-24 text-center">
        <p className="text-sm text-muted-foreground">Missing trip details.</p>
        <Button nativeButton={false} variant="outline" render={<Link href="/browse" />}>
          Find a stay
        </Button>
      </div>
    );
  }

  if (resumeError) {
    return (
      <div className="mx-auto flex w-full max-w-[1080px] flex-col items-center gap-4 px-6 py-24 text-center">
        <p className="max-w-md text-sm text-muted-foreground text-pretty">{resumeError}</p>
        <Button nativeButton={false} variant="outline" render={<Link href="/bookings" />}>
          Back to trips
        </Button>
      </div>
    );
  }

  // Resume mode renders from the booking; wait for it before drawing the grid.
  if (resumeBookingId && !booking) {
    return <CheckoutFallback />;
  }

  const effectiveCheckIn = checkIn || booking?.checkIn || "";
  const effectiveCheckOut = checkOut || booking?.checkOut || "";

  const nights = nightsBetween(effectiveCheckIn, effectiveCheckOut);
  const subtotal = property ? nights * Number(property.pricePerNight) : 0;
  const totalDisplay = booking ? formatPrice(booking.totalPrice) : formatPrice(subtotal);

  const settingUp = bookingMutation.isPending || intentMutation.isPending;
  const setupError = intentMutation.isError
    ? (intentMutation.error as Error).message
    : bookingMutation.isError
      ? (bookingMutation.error as Error).message
      : "";

  const continueLabel = bookingMutation.isPending
    ? "Creating booking…"
    : intentMutation.isPending
      ? "Setting up payment…"
      : booking && setupError
        ? "Retry payment setup"
        : `Continue to payment · ${totalDisplay}`;

  function goToConfirmation() {
    if (!booking) return;
    sessionStorage.removeItem(resumeKey);
    router.push(`/confirmation?bookingId=${booking.id}`);
  }

  const grid = (
    <div className="grid items-start gap-14 lg:grid-cols-[1fr_380px]">
      <div className="min-w-0">
        <section className="border-b border-border pb-6">
          <h2 className="mb-3.5 text-[17px] font-semibold tracking-tight">Your trip</h2>
          <div className="flex items-start justify-between gap-4 py-1">
            <div>
              <div className="text-sm font-medium">Dates</div>
              <div className="mt-0.5 text-sm text-muted-foreground">
                {formatRange(effectiveCheckIn, effectiveCheckOut)} · {nights}{" "}
                {nights === 1 ? "night" : "nights"}
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
                disabled={guests <= 1 || Boolean(booking)}
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
                disabled={(Boolean(property) && guests >= property!.maxGuests) || Boolean(booking)}
              >
                <Plus className="size-[15px]" />
              </button>
            </div>
          </div>
        </section>

        {clientSecret && booking ? (
          <section className="pt-6">
            <h2 className="mb-4 text-[17px] font-semibold tracking-tight">Pay with</h2>
            <PaymentElement />
          </section>
        ) : null}
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
                {property ? formatPrice(property.pricePerNight) : "N/A"} × {nights}{" "}
                {nights === 1 ? "night" : "nights"}
              </span>
              <span>{formatPrice(subtotal)}</span>
            </div>
          </div>

          <div className="flex justify-between py-4 text-base font-semibold">
            <span>Total (USD)</span>
            <span>{totalDisplay}</span>
          </div>

          {clientSecret && booking ? (
            <PayButton bookingId={booking.id} totalDisplay={totalDisplay} onPaid={goToConfirmation} />
          ) : (
            <>
              {setupError ? <ErrorBox>{setupError}</ErrorBox> : null}
              <Button
                size="lg"
                className="mt-3 w-full"
                disabled={settingUp || !property}
                onClick={onContinue}
              >
                {settingUp ? (
                  <>
                    <Loader2 className="mr-2 animate-spin" />
                    {continueLabel}
                  </>
                ) : (
                  continueLabel
                )}
              </Button>
              <p className="mt-3 text-center text-xs text-muted-foreground text-pretty">
                You&apos;ll enter card details on the next step. Test mode. No real charges.
              </p>
              <p className="mt-1.5 text-center text-xs text-muted-foreground text-pretty">
                Unpaid bookings are held until check-in, up to 24 hours, then released.
              </p>
            </>
          )}
        </Card>
      </aside>
    </div>
  );

  return (
    <div className="flex flex-1 flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 max-w-[1080px] items-center gap-4 px-6">
          <Link href="/" className="flex items-center gap-2 text-[17px] font-semibold tracking-tight">
            <span className="inline-block size-2.5 rounded-full bg-primary" />
            GMCK Booking
          </Link>
          <span className="ml-auto inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
            <Lock className="size-3.5" />
            Secure checkout
          </span>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[1080px] px-6 pt-7">
        <Link
          href={effectivePropertyId ? `/properties/${effectivePropertyId}` : "/bookings"}
          className="mb-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-[15px]" />
          Back to listing
        </Link>
        <h1 className="mb-7 text-[27px] font-semibold tracking-tight">Confirm and pay</h1>

        {clientSecret ? (
          <Elements stripe={getStripe()} options={{ clientSecret }}>
            {grid}
          </Elements>
        ) : (
          grid
        )}
      </main>
    </div>
  );
}

function PayButton({
  bookingId,
  totalDisplay,
  onPaid,
}: {
  bookingId: string;
  totalDisplay: string;
  onPaid: () => void;
}) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState("");

  async function onPay() {
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError("");
    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/confirmation?bookingId=${bookingId}`,
      },
      redirect: "if_required",
    });
    if (confirmError) {
      setError(confirmError.message ?? "Payment failed. Try again.");
      setSubmitting(false);
      return;
    }
    onPaid();
  }

  return (
    <>
      {error ? <ErrorBox>{error}</ErrorBox> : null}
      <Button
        size="lg"
        className="mt-3 w-full"
        disabled={!stripe || !elements || submitting}
        onClick={onPay}
      >
        {submitting ? (
          <>
            <Loader2 className="mr-2 animate-spin" />
            Processing…
          </>
        ) : (
          `Pay ${totalDisplay}`
        )}
      </Button>
      <p className="mt-3 text-center text-xs text-muted-foreground text-pretty">
        Processed securely by Stripe in test mode. Use card 4242 4242 4242 4242.
      </p>
    </>
  );
}
