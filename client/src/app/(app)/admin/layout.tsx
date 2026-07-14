"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuthStore } from "@/lib/auth/store";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const { status, user } = useAuthStore();
  const router = useRouter();

  useEffect(() => {
    if (status === "authed" && user?.role !== "ADMIN") {
      router.replace("/");
    }
  }, [status, user, router]);

  if (status === "idle" || status === "loading") {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span className="text-muted-foreground text-sm">Loading…</span>
      </div>
    );
  }

  if (status === "anon") return null;

  if (user?.role !== "ADMIN") return null;

  return <>{children}</>;
}
