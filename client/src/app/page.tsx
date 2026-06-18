import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold tracking-tight">Booking Service</h1>
      <p className="text-muted-foreground max-w-sm">
        Find and book unique places to stay around the world.
      </p>
      <div className="flex gap-3">
        <Button nativeButton={false} render={<Link href="/login" />}>
          Sign in
        </Button>
        <Button
          nativeButton={false}
          variant="outline"
          render={<Link href="/register" />}
        >
          Create account
        </Button>
      </div>
    </main>
  );
}
