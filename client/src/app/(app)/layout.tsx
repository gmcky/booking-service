"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { status } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (status === "anon") {
      router.replace("/login");
    }
  }, [status, router]);

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
