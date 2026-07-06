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
  onRangeChange: (checkIn?: Date, checkOut?: Date) => void;
}

/**
 * Interactive two-month calendar: blocked dates greyed, free dates
 * selectable as a stay range. The range is owned by the detail view and
 * shared with the reserve card, so picking here reprices the booking.
 * Reuses the same blocked-dates query/matchers as the booking card via
 * `useBlockedDates` — TanStack Query dedupes the fetch.
 */
export function AvailabilitySection({
  propertyId,
  city,
  checkIn,
  checkOut,
  onRangeChange,
}: AvailabilitySectionProps) {
  const { blockedMatchers } = useBlockedDates(propertyId);
  const today = startOfToday();

  const selected: DateRange | undefined = checkIn
    ? { from: checkIn, to: checkOut }
    : undefined;

  function handleSelect(next?: DateRange) {
    const from = next?.from;
    // A single click produces from === to; treat it as "check-in picked,
    // checkout still open" rather than a zero-night stay.
    const to = next?.to && from && next.to.getTime() !== from.getTime() ? next.to : undefined;
    onRangeChange(from, to);
  }

  const nights = nightsBetween(checkIn, checkOut);

  return (
    <div id="availability" className="scroll-mt-32 border-b border-border py-6">
      <div className="mb-[18px] flex flex-wrap items-end justify-between gap-2">
        <div>
          <h2 className="text-[19px] font-semibold tracking-tight">
            {nights > 0 ? `${nights} ${nights === 1 ? "night" : "nights"} in ${city}` : "Availability"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {checkIn
              ? `${format(checkIn, "MMM d, yyyy")} – ${checkOut ? format(checkOut, "MMM d, yyyy") : "select checkout"}`
              : "Select your check-in date"}
          </p>
        </div>
        {checkIn ? (
          <button
            type="button"
            onClick={() => onRangeChange(undefined, undefined)}
            className="text-sm font-medium text-foreground underline underline-offset-2"
          >
            Clear dates
          </button>
        ) : null}
      </div>
      {/* Container query: cells shrink with the column instead of forcing a
          horizontal scrollbar (14 cells + the 2.5rem month gap must fit). */}
      <div className="overflow-x-auto pb-1 [container-type:inline-size]">
        <Calendar
          mode="range"
          selected={selected}
          onSelect={handleSelect}
          excludeDisabled
          numberOfMonths={2}
          showOutsideDays={false}
          disabled={[{ before: today }, ...blockedMatchers]}
          className="p-0"
          style={
            {
              "--cell-size": "clamp(1.75rem, calc((100cqw - 2.5rem) / 14), 2.5rem)",
            } as React.CSSProperties
          }
          classNames={{
            months: "relative flex flex-col gap-6 md:flex-row md:gap-10",
            month_caption:
              "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size) whitespace-nowrap",
            caption_label: "text-[15px] font-medium select-none",
          }}
        />
      </div>
    </div>
  );
}
