import Link from "next/link";
import { headers } from "next/headers";
import { ArrowRight } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
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
            Hand-picked homes, cabins, and apartments — booked in a few taps.
          </p>
        </section>

        <section className="mx-auto mb-2 max-w-[920px]">
          <SearchPill />
        </section>

        <section className="flex items-baseline justify-between pt-14">
          <h2 className="text-[22px] font-semibold tracking-tight">Popular this week</h2>
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

        <footer className="mt-20 flex flex-wrap items-center justify-between gap-4 border-t border-border py-8">
          <span className="font-mono text-xs text-muted-foreground">© 2026 GMCK Booking</span>
          <nav className="flex gap-5 text-[13px] text-muted-foreground">
            <Link href="#">Support</Link>
            <Link href="#">Privacy</Link>
            <Link href="#">Terms</Link>
            <Link href="#">Hosting</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}
