"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { MapPin, Search, Users } from "lucide-react";
import { DatePicker } from "@/components/ui/date-picker";
import { Button } from "@/components/ui/button";

function toISODate(date?: Date): string | undefined {
  return date
    ? `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(
        date.getDate(),
      ).padStart(2, "0")}`
    : undefined;
}

export function SearchBar() {
  const router = useRouter();
  const [city, setCity] = React.useState("");
  const [checkIn, setCheckIn] = React.useState<Date | undefined>();
  const [checkOut, setCheckOut] = React.useState<Date | undefined>();
  const [guests, setGuests] = React.useState("");

  function onSearch() {
    const params = new URLSearchParams();
    if (city.trim()) params.set("city", city.trim());
    const inDate = toISODate(checkIn);
    const outDate = toISODate(checkOut);
    if (inDate && outDate) {
      params.set("checkIn", inDate);
      params.set("checkOut", outDate);
    }
    if (guests.trim()) params.set("maxGuests", guests.trim());
    const qs = params.toString();
    router.push(qs ? `/browse?${qs}` : "/browse");
  }

  return (
    <div className="rounded-2xl border border-border bg-card p-2.5 shadow-sm">
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-end sm:gap-0">
        <label className="min-w-0 flex-[1.4] px-4 py-2">
          <span className="mb-1.5 block font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            Where
          </span>
          <div className="flex items-center gap-2 text-muted-foreground">
            <MapPin className="size-4 shrink-0" />
            <input
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Search destinations"
              className="w-full bg-transparent text-[15px] text-foreground outline-none"
            />
          </div>
        </label>

        <Divider />

        <label className="min-w-0 flex-1 px-4 py-2">
          <span className="mb-1.5 block font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            Check in
          </span>
          <DatePicker value={checkIn} onChange={setCheckIn} placeholder="Add date" />
        </label>

        <Divider />

        <label className="min-w-0 flex-1 px-4 py-2">
          <span className="mb-1.5 block font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            Check out
          </span>
          <DatePicker value={checkOut} onChange={setCheckOut} placeholder="Add date" />
        </label>

        <Divider />

        <label className="min-w-0 flex-[0.9] px-4 py-2">
          <span className="mb-1.5 block font-mono text-[11px] tracking-wide text-muted-foreground uppercase">
            Guests
          </span>
          <div className="flex items-center gap-2 text-muted-foreground">
            <Users className="size-4 shrink-0" />
            <input
              type="number"
              min={1}
              value={guests}
              onChange={(e) => setGuests(e.target.value)}
              placeholder="Add guests"
              className="w-full bg-transparent text-[15px] text-foreground outline-none"
            />
          </div>
        </label>

        <div className="p-2">
          <Button size="lg" className="w-full" onClick={onSearch}>
            <Search className="mr-1.5" />
            Search
          </Button>
        </div>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="my-2 hidden w-px self-stretch bg-border sm:block" />;
}
