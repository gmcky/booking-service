"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function Error({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <div className="flex size-13 items-center justify-center rounded-full border border-border text-destructive">
        <AlertTriangle className="size-5" />
      </div>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
        <p className="mt-1.5 max-w-[340px] text-sm text-muted-foreground text-pretty">
          An unexpected error occurred. You can try again or head back home.
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        <Button variant="outline" onClick={() => unstable_retry()}>
          Try again
        </Button>
        <Button nativeButton={false} render={<Link href="/" />}>
          Back home
        </Button>
      </div>
    </div>
  );
}
