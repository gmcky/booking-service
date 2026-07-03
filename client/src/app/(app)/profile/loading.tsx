import { SiteHeader } from "@/components/layout/site-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1040px] px-6 pt-10">
        <div className="grid items-start gap-12 lg:grid-cols-[212px_1fr]">
          <div className="flex flex-col gap-1">
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-9 w-full rounded-lg" />
            ))}
          </div>

          <div className="flex max-w-[640px] min-w-0 flex-col gap-4">
            <Skeleton className="h-8 w-1/3" />
            <Skeleton className="h-24 w-full rounded-xl" />
            <Skeleton className="h-24 w-full rounded-xl" />
          </div>
        </div>
      </main>
    </div>
  );
}
