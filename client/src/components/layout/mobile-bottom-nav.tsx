"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Search, Heart, Luggage, House, CircleUser } from "lucide-react";
import { useAuthStore } from "@/lib/auth/store";
import { cn } from "@/lib/utils";

type Item = { href: string; label: string; icon: React.ElementType };

// No "Messages" — there's no messaging feature — so Host takes a top-level tab.
const AUTHED: Item[] = [
  { href: "/browse", label: "Explore", icon: Search },
  { href: "/favorites", label: "Wishlists", icon: Heart },
  { href: "/bookings", label: "Trips", icon: Luggage },
  { href: "/host/properties", label: "Host", icon: House },
  { href: "/profile", label: "Profile", icon: CircleUser },
];

const ANON: Item[] = [
  { href: "/browse", label: "Explore", icon: Search },
  { href: "/favorites", label: "Wishlists", icon: Heart },
  { href: "/login", label: "Log in", icon: CircleUser },
];

function isActive(pathname: string, href: string): boolean {
  if (href === "/browse") return pathname === "/browse" || pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

/** Airbnb-style bottom tab bar, mobile/tablet only. The top header takes over
 *  from `lg` up. */
export function MobileBottomNav() {
  const pathname = usePathname();
  const authed = useAuthStore((s) => s.status === "authed");
  const items = authed ? AUTHED : ANON;

  return (
    <nav className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-background/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
      <ul className="flex items-stretch justify-around">
        {items.map(({ href, label, icon: Icon }) => {
          const active = isActive(pathname, href);
          return (
            <li key={href} className="flex-1">
              <Link
                href={href}
                className={cn(
                  "flex flex-col items-center gap-1 py-2 text-[10px] font-medium transition-colors",
                  active ? "text-primary" : "text-muted-foreground",
                )}
              >
                <Icon className={cn("size-5", active && href === "/favorites" && "fill-current")} />
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
