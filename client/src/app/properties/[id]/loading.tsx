import { SiteHeader } from "@/components/layout/site-header";
import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-[1120px] px-6 pt-6">
        <Skeleton className="mb-10 h-[420px] w-full" />
        <Skeleton className="h-8 w-1/3" />
      </main>
    </div>
  );
}
