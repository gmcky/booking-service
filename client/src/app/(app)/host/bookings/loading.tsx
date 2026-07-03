import { SiteHeader } from "@/components/layout/site-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1120px] px-6 pt-10">
        <h1 className="mb-1 text-3xl font-semibold tracking-tight">Reservations</h1>
        <p className="mb-6 text-[15px] text-muted-foreground">Loading…</p>

        <div className="flex flex-col gap-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-[168px] rounded-xl" />
          ))}
        </div>
      </main>
    </div>
  );
}
