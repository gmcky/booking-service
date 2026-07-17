import Link from "next/link";
import { cn } from "@/lib/utils";

/** Shared bottom-of-page footer. Margin varies per page, pass it via className. */
export function SiteFooter({ className }: { className?: string }) {
  return (
    <footer
      className={cn(
        "mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-border py-8",
        className,
      )}
    >
      <span className="font-mono text-xs text-muted-foreground">© 2026 GMCK Booking</span>
      <nav className="flex gap-5 text-[13px] text-muted-foreground">
        <Link href="/support" className="hover:text-foreground">
          Support
        </Link>
        <Link href="/privacy" className="hover:text-foreground">
          Privacy
        </Link>
        <Link href="/terms" className="hover:text-foreground">
          Terms
        </Link>
        <Link href="/host/properties" className="hover:text-foreground">
          Hosting
        </Link>
      </nav>
    </footer>
  );
}
