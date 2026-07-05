"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { addDays } from "date-fns";
import { bookingApi } from "@/lib/api/bookings";
import { queryKeys } from "@/lib/query/keys";
import { isoToLocalDate } from "@/lib/utils/dates";

export interface DateRangeMatcher {
  from: Date;
  to: Date;
}

/**
 * Fetches a property's blocked dates and derives the two disabled-date
 * matcher sets used by both the booking card's date pickers and the
 * read-only availability calendar. Shared so both consumers hit the same
 * query key — TanStack Query dedupes the request.
 */
export function useBlockedDates(propertyId: string) {
  const {
    data: blocked,
    isPending,
    isError,
  } = useQuery({
    queryKey: queryKeys.bookings.blockedDates(propertyId),
    queryFn: () => bookingApi.blockedDates(propertyId),
  });

  // Booked ranges occupy nights [checkIn, checkOut) — the checkout day itself
  // is free for a new arrival. Host-blocked ranges are inclusive on both ends.
  const blockedMatchers = React.useMemo<DateRangeMatcher[]>(() => {
    if (!blocked) return [];
    return [
      ...blocked.bookedRanges.map((r) => ({
        from: isoToLocalDate(r.checkIn),
        to: addDays(isoToLocalDate(r.checkOut), -1),
      })),
      ...blocked.blockedRanges.map((r) => ({
        from: isoToLocalDate(r.startDate),
        to: isoToLocalDate(r.endDate),
      })),
    ].filter((r) => r.to >= r.from);
  }, [blocked]);

  // Departure semantics differ: day D is a valid checkout iff night D-1 is
  // free, so every range shifts one day forward. Reusing the arrival matchers
  // would wrongly disable an existing booking's check-in day as a departure
  // (same-day turnover). Ranges spanning a blocked gap are still possible to
  // select here; check-availability catches those before checkout.
  const checkoutMatchers = React.useMemo<DateRangeMatcher[]>(() => {
    if (!blocked) return [];
    return [
      ...blocked.bookedRanges.map((r) => ({
        from: addDays(isoToLocalDate(r.checkIn), 1),
        to: isoToLocalDate(r.checkOut),
      })),
      ...blocked.blockedRanges.map((r) => ({
        from: addDays(isoToLocalDate(r.startDate), 1),
        to: addDays(isoToLocalDate(r.endDate), 1),
      })),
    ].filter((r) => r.to >= r.from);
  }, [blocked]);

  return { blocked, isPending, isError, blockedMatchers, checkoutMatchers };
}
