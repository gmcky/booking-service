"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { Toaster } from "@/components/ui/sonner";
import { makeQueryClient } from "@/lib/query/client";
import { useSession } from "@/lib/auth/useSession";
import { clearStaleBodyScrollLock } from "@/lib/utils/scroll-lock";

function SessionBootstrap({ children }: { children: React.ReactNode }) {
  useSession();
  return <>{children}</>;
}

/** A page must never inherit a frozen body from the previous route — clears
 *  a lingering inline overflow when no overlay actually holds a lock. Runs
 *  after page effects (parent effects fire last), so fresh locks survive. */
function ScrollLockFailsafe() {
  const pathname = usePathname();
  useEffect(() => {
    clearStaleBodyScrollLock();
  }, [pathname]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(() => makeQueryClient());

  return (
    <QueryClientProvider client={queryClient}>
      <SessionBootstrap>{children}</SessionBootstrap>
      <ScrollLockFailsafe />
      <Toaster richColors />
      <ReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
