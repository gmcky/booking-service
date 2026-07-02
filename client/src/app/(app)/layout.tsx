"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuthStore();
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (status === "anon") {
      router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
    }
  }, [status, router, pathname]);

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-muted-foreground text-sm">Loading…</span>
      </div>
    );
  }

  if (status === "anon") return null;

  return <>{children}</>;
}
