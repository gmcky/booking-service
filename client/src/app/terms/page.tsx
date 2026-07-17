import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export const metadata: Metadata = {
  title: "Terms · GMCK Booking",
};

export default function TermsPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[720px] flex-1 px-6">
        <h1 className="pt-14 text-3xl font-semibold tracking-tight">Terms</h1>

        <div className="mt-6 flex flex-col gap-5 text-[15px] leading-relaxed text-muted-foreground">
          <p className="text-foreground">
            Short version: this is a portfolio demo, not a travel service. Use it accordingly.
          </p>

          <section>
            <h2 className="mb-1.5 text-base font-medium text-foreground">No real stays</h2>
            <p>
              The listings are seeded demo content. A booking here does not entitle you to stay
              anywhere, and no host will be expecting you.
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-base font-medium text-foreground">Test payments only</h2>
            <p>
              Checkout runs in Stripe test mode. Use the test card 4242 4242 4242 4242 and never
              enter a real card number.
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-base font-medium text-foreground">Demo data</h2>
            <p>
              Accounts and content may be removed during periodic cleanups or database resets,
              without notice. Do not keep anything here you would miss.
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-base font-medium text-foreground">Fair use</h2>
            <p>
              Poking at the app is encouraged, that is what it is for. Scraping, spam and abuse
              of the demo infrastructure are not.
            </p>
          </section>

          <p>
            The code is MIT licensed and available on{" "}
            <a
              href="https://github.com/gmcky/booking-service"
              className="text-foreground underline underline-offset-2"
            >
              GitHub
            </a>
            .
          </p>
        </div>

        <SiteFooter className="mt-20" />
      </main>
    </div>
  );
}
