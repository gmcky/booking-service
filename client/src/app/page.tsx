import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { SearchPill } from "@/components/search/search-pill";
import { PropertyGrid } from "@/components/property/property-grid";
import { HomeCityRows } from "@/components/property/home-city-rows";
import { detectLocation } from "@/lib/geo/detect-location";

// Isolated so the `headers()` read (for the geo "near you" row) stays in its
// own subtree rather than forcing intent onto the rest of the page.
async function DetectedCityRows() {
  const detected = detectLocation(await headers());
  return <HomeCityRows detected={detected} />;
}

export default function HomePage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1120px] px-6">
        <section className="mx-auto max-w-[680px] py-12 pt-22 text-center">
          <div className="mb-5 font-mono text-xs tracking-widest text-muted-foreground uppercase">
            Stays worldwide
          </div>
          <h1 className="text-5xl leading-[1.05] font-semibold tracking-tight text-balance">
            Find a place to stay, anywhere you go.
          </h1>
          <p className="mt-4 text-[17px] text-muted-foreground text-pretty">
            Hand-picked homes, cabins, and apartments. Booked in a few taps.
          </p>
        </section>

        <section className="mx-auto mb-2 max-w-[920px]">
          {/* Full expanded pill on desktop; a compact tap-to-open pill on mobile. */}
          <div className="hidden lg:block">
            <SearchPill />
          </div>
          <div className="lg:hidden">
            <SearchPill collapsible compact />
          </div>
        </section>

        <section className="flex items-baseline justify-between pt-14">
          <h2 className="text-[22px] font-semibold tracking-tight">Featured stays</h2>
          <Link
            href="/browse"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            View all
            <ArrowRight className="size-[15px]" />
          </Link>
        </section>

        <section className="pt-6">
          <PropertyGrid query={{ limit: 8, sort: "newest" }} />
        </section>

        <DetectedCityRows />

        <section className="mt-20 flex flex-col items-center gap-4 rounded-2xl bg-muted/50 px-6 py-14 text-center">
          <h2 className="text-[22px] font-semibold tracking-tight">
            Haven't found your place yet?
          </h2>
          <p className="max-w-md text-[15px] text-muted-foreground">
            This is just a taste. Browse every stay with filters, dates and a live map.
          </p>
          <Button size="lg" nativeButton={false} className="mt-2" render={<Link href="/browse" />}>
            Explore all stays
            <ArrowRight className="size-4" />
          </Button>
        </section>

        <SiteFooter className="mt-20" />
      </main>
    </div>
  );
}
