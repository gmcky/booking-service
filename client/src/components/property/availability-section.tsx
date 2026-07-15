"use client";

import * as React from "react";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { Calendar } from "@/components/ui/calendar";
import { nightsBetween, startOfToday } from "@/lib/utils/dates";
import { useBlockedDates } from "./use-blocked-dates";

export interface AvailabilitySectionProps {
  propertyId: string;
  city: string;
  checkIn?: Date;
  checkOut?: Date;
}

/**
 * Read-only two-month calendar: blocked dates greyed, the stay picked in
 * the reserve card highlighted. Deliberately not clickable — the reserve
 * card owns date picking; a second interactive calendar mid-page invited
 * mis-taps while scrolling on phones. Reuses the same blocked-dates
 * query/matchers as the booking card via `useBlockedDates` — TanStack
 * Query dedupes the fetch.
 */
export function AvailabilitySection({
  propertyId,
  city,
  checkIn,
  checkOut,
}: AvailabilitySectionProps) {
  const { blockedMatchers } = useBlockedDates(propertyId);
  const today = startOfToday();

  const selected: DateRange | undefined = checkIn
    ? { from: checkIn, to: checkOut }
    : undefined;

  const nights = nightsBetween(checkIn, checkOut);

  return (
    <div id="availability" className="scroll-mt-32 border-b border-border py-6">
      <div className="mb-[18px]">
        <h2 className="text-[19px] font-semibold tracking-tight">
          {nights > 0 ? `${nights} ${nights === 1 ? "night" : "nights"} in ${city}` : "Availability"}
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {checkIn
            ? `${format(checkIn, "MMM d, yyyy")} – ${checkOut ? format(checkOut, "MMM d, yyyy") : "select checkout in the booking form"}`
            : "Unavailable dates are greyed out"}
        </p>
      </div>
      {/* Container query: cells shrink with the column instead of forcing a
          horizontal scrollbar. Below md the months stack, so a cell is 1/7 of
          the container; side by side it's 1/14 plus the 2.5rem month gap. */}
      <div className="overflow-x-auto pb-1 [container-type:inline-size]">
        <Calendar
          mode="range"
          selected={selected}
          numberOfMonths={2}
          showOutsideDays={false}
          disabled={[{ before: today }, ...blockedMatchers]}
          className="mx-auto p-0 [--cell-size:clamp(2.25rem,calc(100cqw/7),3.25rem)] md:[--cell-size:clamp(1.75rem,calc((100cqw-2.5rem)/14),2.5rem)] [&_tbody]:pointer-events-none"
          classNames={{
            months: "relative flex flex-col gap-8 md:flex-row md:gap-10",
            month_caption:
              "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size) whitespace-nowrap",
            caption_label: "text-[15px] font-medium select-none",
          }}
        />
      </div>
    </div>
  );
}
