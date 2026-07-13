"use client";

import Link from "next/link";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { Star, User } from "lucide-react";
import { SiteHeader } from "@/components/layout/site-header";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PropertyCard } from "@/components/property/property-card";
import { userApi, type HostReview } from "@/lib/api/users";
import { propertyApi } from "@/lib/api/properties";
import { queryKeys } from "@/lib/query/keys";
import { formatRating } from "@/lib/utils/money";
import { hostingDuration } from "@/components/host/hosting-duration";

const REVIEW_PAGE_SIZE = 6;
const LISTINGS_LIMIT = 12;

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export function HostProfileView({ id }: { id: string }) {
  const {
    data: host,
    isPending,
    isError,
    error,
    refetch,
  } = useQuery({
    queryKey: queryKeys.users.publicProfile(id),
    queryFn: () => userApi.publicProfile(id),
    retry: (failureCount, err) => (err as Error).message !== "User not found" && failureCount < 2,
  });

  if (isPending) {
    return (
      <div className="flex flex-1 flex-col">
        <SiteHeader />
        <main className="mx-auto w-full max-w-[1120px] px-6 py-10">
          <div className="grid gap-10 lg:grid-cols-[360px_1fr]">
            <div className="h-[280px] animate-pulse rounded-2xl bg-muted" />
            <div className="flex flex-col gap-4">
              <div className="h-7 w-1/3 animate-pulse rounded bg-muted" />
              <div className="h-24 animate-pulse rounded bg-muted" />
            </div>
          </div>
        </main>
      </div>
    );
  }

  if (isError) {
    const notFound = (error as Error).message === "User not found";
    return (
      <div className="flex flex-1 flex-col">
        <SiteHeader />
        <main className="mx-auto flex w-full max-w-[1120px] flex-1 flex-col items-center justify-center gap-4 px-6 py-24 text-center">
          {notFound ? (
            <>
              <h1 className="text-lg font-semibold tracking-tight">Host not found</h1>
              <p className="max-w-[340px] text-sm text-muted-foreground text-pretty">
                This host doesn&apos;t exist or their profile is no longer available.
              </p>
              <Button nativeButton={false} variant="outline" render={<Link href="/" />}>
                Back home
              </Button>
            </>
          ) : (
            <>
              <p className="text-sm text-destructive">{(error as Error).message}</p>
              <Button variant="outline" onClick={() => refetch()}>
                Try again
              </Button>
            </>
          )}
        </main>
      </div>
    );
  }

  const rating = formatRating(host.averageRating);
  const duration = hostingDuration(host.createdAt);
  const hostingSince = new Date(host.createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  const stats: Array<{ value: string; label: string; icon?: boolean }> = [
    {
      value: String(host.reviewsCount),
      label: host.reviewsCount === 1 ? "Review" : "Reviews",
    },
    ...(rating ? [{ value: rating, label: "Rating", icon: true }] : []),
    { value: duration.value, label: duration.unit },
  ];

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1120px] px-6 py-10">
        <div className="grid gap-10 lg:grid-cols-[360px_1fr]">
          <div className="lg:sticky lg:top-22 lg:self-start">
            <div className="flex flex-col items-center gap-3 rounded-2xl border border-border px-7 py-8 text-center shadow-sm">
              <Avatar className="size-28">
                {host.avatarUrl ? <AvatarImage src={host.avatarUrl} alt="" /> : null}
                <AvatarFallback className="text-3xl">
                  {initials(host.firstName, host.lastName) || <User className="size-10" />}
                </AvatarFallback>
              </Avatar>
              <div>
                <p className="text-xl font-semibold tracking-tight">{host.firstName}</p>
                <p className="text-sm text-muted-foreground">Host</p>
              </div>
              <dl className="mt-2 flex w-full flex-col">
                {stats.map((stat, i) => (
                  <div
                    key={stat.label}
                    className={
                      i > 0
                        ? "flex items-center justify-between border-t border-border py-2.5"
                        : "flex items-center justify-between pb-2.5"
                    }
                  >
                    <dt className="text-sm text-muted-foreground">{stat.label}</dt>
                    <dd className="flex items-center gap-1 text-sm font-semibold">
                      {stat.value}
                      {stat.icon ? <Star className="size-3.5 fill-current" /> : null}
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>

          <div className="flex flex-col gap-10">
            <section>
              <h2 className="mb-3 text-[19px] font-semibold tracking-tight">
                About {host.firstName}
              </h2>
              {host.bio ? (
                <p className="mb-2 text-[15px] leading-relaxed text-pretty">{host.bio}</p>
              ) : null}
              <p className="text-sm text-muted-foreground">Hosting since {hostingSince}</p>
            </section>

            <HostReviews hostId={id} firstName={host.firstName} />

            <HostListings hostId={id} firstName={host.firstName} />
          </div>
        </div>

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

function HostReviews({ hostId, firstName }: { hostId: string; firstName: string }) {
  const query = { limit: REVIEW_PAGE_SIZE };
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
    queryKey: queryKeys.users.hostReviews(hostId, query),
    queryFn: ({ pageParam }) => userApi.hostReviews(hostId, { ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => {
      const page = last.pagination.page ?? 1;
      const totalPages = last.pagination.totalPages ?? page;
      return page < totalPages ? page + 1 : undefined;
    },
  });

  const reviews = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <section>
      <h2 className="mb-[18px] text-[19px] font-semibold tracking-tight">
        {firstName}&apos;s reviews
      </h2>

      {isError ? (
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-destructive">{(error as Error).message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      ) : isPending ? (
        <div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-24" />
          ))}
        </div>
      ) : reviews.length === 0 ? (
        <p className="text-sm text-muted-foreground">No reviews yet.</p>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-x-10 gap-y-6 sm:grid-cols-2">
            {reviews.map((r) => (
              <HostReviewItem key={r.id} review={r} hostFirstName={firstName} />
            ))}
          </div>
          {hasNextPage ? (
            <div className="flex justify-center py-6">
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
    </section>
  );
}

function HostReviewItem({ review, hostFirstName }: { review: HostReview; hostFirstName: string }) {
  const date = new Date(review.createdAt).toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
  });

  return (
    <div>
      <div className="mb-2 flex items-center gap-2.5">
        <Avatar className="size-[34px] shrink-0 border border-border">
          {review.user.avatarUrl ? <AvatarImage src={review.user.avatarUrl} alt="" /> : null}
          <AvatarFallback>{initials(review.user.firstName, review.user.lastName)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <div className="text-sm font-medium">{review.user.firstName}</div>
          <div className="font-mono text-[11px] text-muted-foreground">{date}</div>
        </div>
        <span className="ml-auto inline-flex items-center gap-1 text-[13px]">
          <Star className="size-3.5 fill-current" />
          {review.rating}
        </span>
      </div>

      {review.comment ? (
        <p className="text-sm leading-relaxed text-muted-foreground">{review.comment}</p>
      ) : null}

      <p className="mt-1 text-xs text-muted-foreground">
        ·{" "}
        <Link
          href={`/properties/${review.property.id}`}
          className="underline-offset-2 transition-colors hover:text-foreground hover:underline"
        >
          {review.property.title}
        </Link>
      </p>

      {review.hostReplyText ? (
        <div className="mt-3 ml-4 border-l-2 border-border pl-3">
          <div className="text-[13px] font-medium">Response from {hostFirstName}</div>
          <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">
            {review.hostReplyText}
          </p>
        </div>
      ) : null}
    </div>
  );
}

function HostListings({ hostId, firstName }: { hostId: string; firstName: string }) {
  const query = { ownerId: hostId, limit: LISTINGS_LIMIT };
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.properties.list(query),
    queryFn: () => propertyApi.search(query),
  });

  const listings = data?.data ?? [];

  if (isPending) {
    return (
      <section>
        <div className="mb-[18px] h-6 w-40 animate-pulse rounded bg-muted" />
        <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-[240px] rounded-xl" />
          ))}
        </div>
      </section>
    );
  }

  if (isError) {
    return (
      <section>
        <div className="flex flex-col items-center gap-3 py-6 text-center">
          <p className="text-sm text-destructive">{(error as Error).message}</p>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            Try again
          </Button>
        </div>
      </section>
    );
  }

  if (listings.length === 0) return null;

  return (
    <section>
      <h2 className="mb-[18px] text-[19px] font-semibold tracking-tight">
        {firstName}&apos;s listings
      </h2>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
        {listings.map((property) => (
          <PropertyCard key={property.id} property={property} />
        ))}
      </div>
    </section>
  );
}
