import type { Metadata } from "next";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";

export const metadata: Metadata = {
  title: "Privacy · GMCK Booking",
};

export default function PrivacyPage() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[720px] flex-1 px-6">
        <h1 className="pt-14 text-3xl font-semibold tracking-tight">Privacy</h1>

        <div className="mt-6 flex flex-col gap-5 text-[15px] leading-relaxed text-muted-foreground">
          <p className="text-foreground">
            GMCK Booking is a demo project. It still handles your data carefully, and this page
            says exactly what it keeps.
          </p>

          <section>
            <h2 className="mb-1.5 text-base font-medium text-foreground">What is stored</h2>
            <p>
              Only what you enter: name, email, optional phone, photo and bio, plus the bookings,
              reviews and wishlists you create. Passwords are stored as bcrypt hashes. Card
              details never touch this service, payment runs entirely inside Stripe (test mode).
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-base font-medium text-foreground">Cookies</h2>
            <p>
              One httpOnly cookie keeps your session refresh token. There are no analytics
              scripts, ad trackers or third-party pixels.
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-base font-medium text-foreground">Emails</h2>
            <p>
              Transactional only: address verification, password reset and booking notifications.
              Nothing promotional, no mailing lists.
            </p>
          </section>

          <section>
            <h2 className="mb-1.5 text-base font-medium text-foreground">Deletion</h2>
            <p>
              Deleting your account anonymizes your personal data while keeping booking history
              consistent. Being a demo, the database may also be reset from time to time, so do
              not treat anything here as permanent storage.
            </p>
          </section>

          <p>
            Nothing is sold or shared. There is no business model here to sell it for.
          </p>
        </div>

        <SiteFooter className="mt-20" />
      </main>
    </div>
  );
}
