import { addDays, addMonths, isSameMonth, startOfMonth } from "date-fns";
import type { DateRange } from "react-day-picker";

export type FlexibleDuration = "weekend" | "week" | "month";

/**
 * Extends a picked base range outward by `days` on each side, clamped so
 * `from` never moves before `today`. Callers must always derive from the
 * immutable base range the user picked — never from a previously-extended
 * range — otherwise switching ±1 -> ±2 would compound instead of replace.
 */
export function extendRange(base: DateRange, days: number, today: Date): DateRange {
  if (!base.from || !base.to) return base;
  const from = addDays(base.from, -days);
  return {
    from: from < today ? today : from,
    to: addDays(base.to, days),
  };
}

/** First date on or after `reference` whose day-of-week is `weekday` (0=Sun..6=Sat). */
function nextWeekdayOnOrAfter(reference: Date, weekday: number): Date {
  const diff = (weekday + 7 - reference.getDay()) % 7;
  return addDays(reference, diff);
}

/**
 * Deliberate demo simplification: a real "flexible dates" search would need
 * any-window availability semantics — "does SOME Fri-Sun / Mon+7 / calendar
 * month window in this month have availability" — which the backend doesn't
 * expose (it only answers "is THIS exact range free?"). So instead of
 * searching a window, this maps each (month, duration) pick to one fixed,
 * deterministic date range and searches that like a normal range.
 *
 * Weekend = first Friday of the month -> Sunday (2 nights).
 * Week    = first Monday of the month -> +7 days.
 * Month   = the 1st -> the 1st of the following month.
 *
 * If `month` is the current month and the natural start already passed:
 * weekend/week shift to the next occurrence of the same weekday on or
 * after `today`; a month stay just starts tomorrow (weekday is
 * meaningless for a month-long window).
 */
export function flexibleWindow(
  month: Date,
  duration: FlexibleDuration,
  today: Date,
): { checkIn: Date; checkOut: Date } {
  const monthStart = startOfMonth(month);
  const isCurrentMonth = isSameMonth(month, today);

  function resolveStart(naturalStart: Date): Date {
    if (isCurrentMonth && naturalStart < today) {
      return nextWeekdayOnOrAfter(today, naturalStart.getDay());
    }
    return naturalStart;
  }

  if (duration === "weekend") {
    const checkIn = resolveStart(nextWeekdayOnOrAfter(monthStart, 5)); // Friday
    return { checkIn, checkOut: addDays(checkIn, 2) };
  }
  if (duration === "week") {
    const checkIn = resolveStart(nextWeekdayOnOrAfter(monthStart, 1)); // Monday
    return { checkIn, checkOut: addDays(checkIn, 7) };
  }
  const checkIn = isCurrentMonth && monthStart < today ? addDays(today, 1) : monthStart;
  return { checkIn, checkOut: addMonths(checkIn, 1) };
}
