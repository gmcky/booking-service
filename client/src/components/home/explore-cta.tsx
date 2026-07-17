"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Closing block of the home page: sends the user to /browse. Client
 *  component solely for the scroll reset — the router can restore a stale
 *  scroll position for a previously visited /browse, landing the user at
 *  the bottom of the list. */
export function ExploreCta() {
  return (
    <section className="mt-20 flex flex-col items-center gap-4 rounded-2xl bg-muted/50 px-6 py-14 text-center">
      <h2 className="text-[22px] font-semibold tracking-tight">Haven't found your place yet?</h2>
      <p className="max-w-md text-[15px] text-muted-foreground">
        This is just a taste. Browse every stay with filters, dates and a live map.
      </p>
      <Button
        size="lg"
        nativeButton={false}
        className="mt-2"
        render={<Link href="/browse" onClick={() => window.scrollTo(0, 0)} />}
      >
        Explore all stays
        <ArrowRight className="size-4" />
      </Button>
    </section>
  );
}
