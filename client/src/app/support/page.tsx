import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export const metadata: Metadata = {
  title: "Support · GMCK Booking",
};

export default function SupportPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[720px] flex-1 px-6">
        <h1 className="pt-14 text-3xl font-semibold tracking-tight">Support</h1>

        <div className="mt-6 flex flex-col gap-5 text-[15px] leading-relaxed text-muted-foreground">
          <p className="text-foreground">
            GMCK Booking is a portfolio project, so there is no support team behind this page.
            Everything below should still get you unstuck.
          </p>

          <section>
            <h2 className="mb-1.5 text-base font-medium text-foreground">Trying the demo</h2>
            <p>
              Sign in with <code className="text-foreground">demo@booking.dev</code> /{" "}
              <code className="text-foreground">demo1234</code>, or use Google sign-in to get a
              fresh account. Payments run in Stripe test mode: card{" "}
              <code className="text-foreground">4242 4242 4242 4242</code>, any future expiry, any
              CVC. No real money moves.
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-base font-medium text-foreground">Something looks broken</h2>
            <p>
              Bug reports are genuinely welcome. Open an issue on{" "}
              <a
                href="https://github.com/gmcky/booking-service/issues"
                className="text-foreground underline underline-offset-2"
              >
                GitHub
              </a>{" "}
              with what you did and what you expected.
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-base font-medium text-foreground">Curious how it works</h2>
            <p>
              The whole thing is open source:{" "}
              <a
                href="https://github.com/gmcky/booking-service"
                className="text-foreground underline underline-offset-2"
              >
                source code
              </a>{" "}
              and{" "}
              <a
                href="https://booking-api.gmcky.dev/api-docs"
                className="text-foreground underline underline-offset-2"
              >
                interactive API docs
              </a>
              .
            </p>
          </section>

          <p>
            See also the <Link href="/privacy" className="underline underline-offset-2">privacy note</Link>{" "}
            and <Link href="/terms" className="underline underline-offset-2">terms</Link>.
          </p>
        </div>

        <SiteFooter className="mt-20" />
      </main>
    </div>
  );
}
