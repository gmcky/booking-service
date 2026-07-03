"use client";

import "./globals.css";

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="flex min-h-full flex-col items-center justify-center gap-4 px-6 text-center">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Something went wrong</h1>
          <p className="mt-1.5 max-w-[340px] text-sm text-muted-foreground text-pretty">
            The app failed to load. Try again in a moment.
          </p>
        </div>
        <button
          onClick={() => unstable_retry()}
          className="inline-flex h-8 items-center justify-center rounded-lg border border-border bg-background px-2.5 text-sm font-medium hover:bg-muted"
        >
          Try again
        </button>
      </body>
    </html>
  );
}
