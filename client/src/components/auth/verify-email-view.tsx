"use client";

import * as React from "react";
import Link from "next/link";
import { CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { endpoints } from "@/lib/api/endpoints";
import { useAuthStore } from "@/lib/auth/store";

type State = "verifying" | "success" | "error";

const DEFAULT_ERROR = "This verification link is invalid or has expired.";

/** Client half of /verify-email. Fires the verify POST exactly once on
 *  mount (`ranRef` guards React 19 Strict Mode's double-invoke). */
export function VerifyEmailView({ token }: { token: string | null }) {
  const [state, setState] = React.useState<State>(token ? "verifying" : "error");
  const [message, setMessage] = React.useState<string | null>(null);
  const markEmailVerified = useAuthStore((s) => s.markEmailVerified);
  const ranRef = React.useRef(false);

  React.useEffect(() => {
    if (!token || ranRef.current) return;
    ranRef.current = true;

    endpoints
      .verifyEmail(token)
      .then(() => {
        setState("success");
        // Only touches the store if a user is currently signed in; a no-op
        // otherwise (verifying while anon just shows the success state).
        markEmailVerified();
      })
      .catch((err) => {
        setMessage(err instanceof Error ? err.message : DEFAULT_ERROR);
        setState("error");
      });
    // Runs once for this token; deliberately excludes `markEmailVerified`
    // (stable zustand action reference, re-running on it would be wrong anyway).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <Card className="w-full max-w-sm">
        <CardHeader>
          <CardTitle>
            {state === "verifying"
              ? "Verifying your email"
              : state === "success"
                ? "Email verified"
                : "Verification failed"}
          </CardTitle>
          <CardDescription>
            {state === "verifying"
              ? "Hang on while we confirm your email address."
              : state === "success"
                ? "You're all set. Bookings and hosting are now unlocked."
                : (message ?? DEFAULT_ERROR)}
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-center gap-4">
          {state === "verifying" ? (
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          ) : state === "success" ? (
            <>
              <CheckCircle2 className="size-10 text-emerald-500" />
              <Button nativeButton={false} className="w-full" render={<Link href="/" />}>
                Back to home
              </Button>
            </>
          ) : (
            <>
              <XCircle className="size-10 text-destructive" />
              <p className="text-center text-sm text-muted-foreground">
                You can request a new link from the banner after signing in.
              </p>
              <Button
                nativeButton={false}
                variant="outline"
                className="w-full"
                render={<Link href="/" />}
              >
                Back to home
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </main>
  );
}
