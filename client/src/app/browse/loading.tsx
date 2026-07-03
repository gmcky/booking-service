import { SiteHeader } from "@/components/layout/site-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1120px] px-6 pt-6 pb-12">
        <div className="mb-6 h-14" />

        <section className="grid grid-cols-[repeat(auto-fill,minmax(264px,1fr))] gap-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="overflow-hidden rounded-xl border border-border">
              <Skeleton className="aspect-square rounded-none" />
              <div className="flex flex-col gap-2 px-4 pt-3 pb-4">
                <Skeleton className="h-3 w-2/3" />
                <Skeleton className="h-2.5 w-2/5" />
                <Skeleton className="h-3 w-1/3" />
              </div>
            </div>
          ))}
        </section>
      </main>
    </div>
  );
}
