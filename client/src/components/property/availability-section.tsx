"use client";

import { Calendar } from "@/components/ui/calendar";
import { startOfToday } from "@/lib/utils/dates";
import { useBlockedDates } from "./use-blocked-dates";

/**
 * Read-only two-month calendar showing which dates are already taken.
 * Reuses the same blocked-dates query/matchers as the booking card via
 * `useBlockedDates` — TanStack Query dedupes the fetch.
 */
export function AvailabilitySection({ propertyId }: { propertyId: string }) {
  const { blockedMatchers } = useBlockedDates(propertyId);
  const today = startOfToday();

  return (
    <div id="availability" className="scroll-mt-32 border-b border-border py-6">
      <h2 className="mb-[18px] text-[19px] font-semibold tracking-tight">Availability</h2>
      <div className="overflow-x-auto pb-1">
        <Calendar
          numberOfMonths={2}
          showOutsideDays={false}
          disabled={[{ before: today }, ...blockedMatchers]}
          className="p-0"
          style={{ "--cell-size": "2.5rem" } as React.CSSProperties}
          classNames={{
            months: "relative flex flex-col gap-6 md:flex-row md:gap-10",
            month_caption:
              "flex h-(--cell-size) w-full items-center justify-center px-(--cell-size) whitespace-nowrap",
            caption_label: "text-[15px] font-medium select-none",
            // Read-only calendar (no `mode`) renders plain text cells without
            // the DayButton that normally carries min-w-(--cell-size) — size
            // the cell itself or the grid collapses.
            day: "relative flex size-(--cell-size) items-center justify-center rounded-(--cell-radius) p-0 text-center text-sm select-none",
          }}
        />
      </div>
    </div>
  );
}
