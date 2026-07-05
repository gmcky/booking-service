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
        />
      </div>
    </div>
  );
}
