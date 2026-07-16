"use client";

import * as React from "react";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/lib/auth/store";
import { endpoints } from "@/lib/api/endpoints";

const COOLDOWN_SECONDS = 60;

/** Slim top-of-page bar, shown on every page (desktop + mobile) whenever a
 *  signed-in user hasn't verified their email yet. Static flow (not fixed),
 *  so it never overlaps the mobile bottom nav. */
export function VerifyEmailBanner() {
  const status = useAuthStore((s) => s.status);
  const emailVerified = useAuthStore((s) => s.user?.emailVerified);
  const [sending, setSending] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);

  React.useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  if (status !== "authed" || emailVerified !== false) return null;

  async function handleResend() {
    setSending(true);
    try {
      await endpoints.resendVerification();
      toast.success("Verification email sent");
      setCooldown(COOLDOWN_SECONDS);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't send verification email");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 border-b border-amber-600/25 bg-amber-500/10 px-4 py-2 text-center text-sm text-amber-900 dark:border-amber-400/25 dark:bg-amber-400/10 dark:text-amber-200">
      <span>Verify your email to unlock bookings and hosting. Check your inbox.</span>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="border-amber-600/30 text-amber-900 hover:bg-amber-500/20 dark:border-amber-400/30 dark:text-amber-200 dark:hover:bg-amber-400/20"
        disabled={sending || cooldown > 0}
        onClick={handleResend}
      >
        {sending ? (
          <Loader2 className="animate-spin" />
        ) : cooldown > 0 ? (
          `Resend in ${cooldown}s`
        ) : (
          "Resend email"
        )}
      </Button>
    </div>
  );
}
