"use client";

import Link from "next/link";
import { User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth/store";

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export function SiteHeader() {
  const { status, user } = useAuthStore();
  const authed = status === "authed";

  return (
    <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-[1120px] items-center gap-8 px-6">
        <Link
          href="/"
          className="flex items-center gap-2 text-[17px] font-semibold tracking-tight"
        >
          <span className="inline-block size-2.5 rounded-full bg-primary" />
          Perch
        </Link>
        <nav className="ml-2 flex items-center gap-1">
          <Link
            href="/browse"
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Explore
          </Link>
          <Link
            href="/bookings"
            className="rounded-lg px-3 py-2 text-sm text-muted-foreground hover:text-foreground"
          >
            Trips
          </Link>
        </nav>
        <div className="ml-auto flex items-center gap-2.5">
          {authed ? (
            <>
              <Button
                nativeButton={false}
                variant="ghost"
                size="sm"
                render={<Link href="/host/properties" />}
              >
                Host dashboard
              </Button>
              <Link href="/profile" aria-label="Account" className="rounded-full">
                <Avatar className="size-9">
                  {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
                  <AvatarFallback>
                    {user && initials(user.firstName, user.lastName) ? (
                      initials(user.firstName, user.lastName)
                    ) : (
                      <User className="size-4" />
                    )}
                  </AvatarFallback>
                </Avatar>
              </Link>
            </>
          ) : (
            <>
              <Button
                nativeButton={false}
                variant="ghost"
                size="sm"
                render={<Link href="/register" />}
              >
                Become a host
              </Button>
              <Button
                nativeButton={false}
                variant="outline"
                size="sm"
                render={<Link href="/login" />}
              >
                Sign in
              </Button>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
