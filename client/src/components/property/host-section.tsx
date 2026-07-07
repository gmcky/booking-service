"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Star, User } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { userApi } from "@/lib/api/users";
import { queryKeys } from "@/lib/query/keys";
import { formatRating } from "@/lib/utils/money";
import { hostingDuration } from "@/components/host/hosting-duration";

function initials(firstName: string, lastName: string): string {
  return `${firstName[0] ?? ""}${lastName[0] ?? ""}`.toUpperCase();
}

export function HostSection({ ownerId }: { ownerId: string }) {
  const { data: host } = useQuery({
    queryKey: queryKeys.users.publicProfile(ownerId),
    queryFn: () => userApi.publicProfile(ownerId),
    staleTime: 5 * 60 * 1000,
  });

  // No skeleton: the section is below the fold and the payload is tiny —
  // popping in fully formed beats a flash of placeholder rows.
  if (!host) return null;

  const rating = formatRating(host.averageRating);
  const duration = hostingDuration(host.createdAt);

  const stats: Array<{ value: string; label: string; icon?: boolean }> = [
    {
      value: String(host.reviewsCount),
      label: host.reviewsCount === 1 ? "Review" : "Reviews",
    },
    ...(rating ? [{ value: rating, label: "Rating", icon: true }] : []),
    { value: duration.value, label: duration.unit },
  ];

  return (
    <div id="host" className="scroll-mt-32 border-t border-border py-6">
      <h2 className="mb-[18px] text-[19px] font-semibold tracking-tight">Meet your host</h2>
      <Link
        href={`/hosts/${ownerId}`}
        className="flex max-w-[560px] items-stretch gap-6 rounded-2xl border border-border px-7 py-6 shadow-sm transition-shadow hover:shadow-md"
      >
        <div className="flex flex-1 flex-col items-center justify-center gap-2 text-center">
          <Avatar className="size-24">
            {host.avatarUrl ? <AvatarImage src={host.avatarUrl} alt="" /> : null}
            <AvatarFallback className="text-2xl">
              {initials(host.firstName, host.lastName) || <User className="size-8" />}
            </AvatarFallback>
          </Avatar>
          <div>
            <p className="text-xl font-semibold tracking-tight">{host.firstName}</p>
            <p className="text-sm text-muted-foreground">
              {host.listingsCount} {host.listingsCount === 1 ? "listing" : "listings"}
            </p>
          </div>
        </div>
        <dl className="flex w-[148px] shrink-0 flex-col justify-center">
          {stats.map((stat, i) => (
            <div
              key={stat.label}
              className={i > 0 ? "border-t border-border pt-2.5 mt-2.5" : undefined}
            >
              <dd className="flex items-center gap-1 text-lg font-semibold">
                {stat.value}
                {stat.icon ? <Star className="size-3.5 fill-current" /> : null}
              </dd>
              <dt className="text-xs text-muted-foreground">{stat.label}</dt>
            </div>
          ))}
        </dl>
      </Link>
    </div>
  );
}
