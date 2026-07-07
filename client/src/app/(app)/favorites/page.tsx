"use client";

import Link from "next/link";
import { useInfiniteQuery } from "@tanstack/react-query";
import { Heart } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { Button } from "@/components/ui/button";
import { PropertyCard } from "@/components/property/property-card";
import { favoriteApi } from "@/lib/api/favorites";
import { queryKeys } from "@/lib/query/keys";

const PAGE_SIZE = 24;

export default function FavoritesPage() {
  const filters = { limit: PAGE_SIZE };

  const {
    data,
    isPending,
    isError,
    error,
    refetch,
    hasNextPage,
    fetchNextPage,
    isFetchingNextPage,
  } = useInfiniteQuery({
    queryKey: queryKeys.favorites.list(filters),
    queryFn: ({ pageParam }) => favoriteApi.list({ ...filters, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const page = last.pagination.page ?? 1;
      const totalPages = last.pagination.totalPages ?? page;
      return page < totalPages ? page + 1 : undefined;
    },
  });

  const favorites = data?.pages.flatMap((p) => p.data) ?? [];
  const total = data?.pages.at(-1)?.pagination.total ?? favorites.length;

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1180px] px-6 pt-10">
        <h1 className="mb-1 text-3xl font-semibold tracking-tight">Favorites</h1>
        <p className="mb-6 text-[15px] text-muted-foreground">
          {isPending
            ? "Loading your favorites…"
            : `${total} saved ${total === 1 ? "stay" : "stays"}`}
        </p>

        {isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-destructive">{(error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : isPending ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-[296px] animate-pulse rounded-xl border border-border bg-muted/40"
              />
            ))}
          </div>
        ) : favorites.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(280px,1fr))] gap-6">
              {favorites.map((f) => (
                <PropertyCard key={f.id} property={f.property} />
              ))}
            </div>
            {hasNextPage ? (
              <div className="flex justify-center py-8">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => fetchNextPage()}
                  disabled={isFetchingNextPage}
                >
                  {isFetchingNextPage ? "Loading…" : "Show more"}
                </Button>
              </div>
            ) : null}
          </>
        )}

        <footer className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-border py-8">
          <span className="font-mono text-xs text-muted-foreground">© 2026 GMCK Booking</span>
          <nav className="flex gap-5 text-[13px] text-muted-foreground">
            <Link href="#">Support</Link>
            <Link href="#">Privacy</Link>
            <Link href="#">Terms</Link>
          </nav>
        </footer>
      </main>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border px-6 py-18 text-center">
      <div className="mb-4 flex size-13 items-center justify-center rounded-full border border-border text-muted-foreground">
        <Heart className="size-5" />
      </div>
      <h2 className="text-lg font-semibold tracking-tight">No favorites yet</h2>
      <p className="mt-1.5 max-w-[320px] text-sm text-muted-foreground text-pretty">
        Tap the heart on any stay to save it here for later.
      </p>
      <Button
        nativeButton={false}
        variant="outline"
        size="sm"
        className="mt-5"
        render={<Link href="/browse" />}
      >
        Explore stays
      </Button>
    </div>
  );
}
