import Link from "next/link";
import { Compass } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
      <div className="flex size-13 items-center justify-center rounded-full border border-border text-muted-foreground">
        <Compass className="size-5" />
      </div>
      <div>
        <h1 className="text-lg font-semibold tracking-tight">Page not found</h1>
        <p className="mt-1.5 max-w-[340px] text-sm text-muted-foreground text-pretty">
          The page you're looking for doesn't exist or may have moved.
        </p>
      </div>
      <div className="flex items-center gap-2.5">
        <Button nativeButton={false} variant="outline" render={<Link href="/browse" />}>
          Browse stays
        </Button>
        <Button nativeButton={false} render={<Link href="/" />}>
          Back home
        </Button>
      </div>
    </div>
  );
}
