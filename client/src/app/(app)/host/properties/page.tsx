"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, MapPin, Tag, Home, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { propertyApi, type HostProperty } from "@/lib/api/properties";
import { formatPrice } from "@/lib/utils/money";
import { PHOTO_STRIPES, photoUrl } from "@/lib/utils/photo";
import { queryKeys } from "@/lib/query/keys";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function HostPropertiesPage() {
  const queryClient = useQueryClient();
  const { data, isPending, isError, error, refetch } = useQuery({
    queryKey: queryKeys.properties.mine,
    queryFn: () => propertyApi.mine(),
  });

  const toggleMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      propertyApi.setActive(id, active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.properties.mine }),
    onError: (err) => toast.error((err as Error).message),
  });

  const removeMutation = useMutation({
    mutationFn: (id: string) => propertyApi.remove(id),
    onSuccess: () => {
      toast.success("Listing removed");
      queryClient.invalidateQueries({ queryKey: queryKeys.properties.mine });
    },
    onError: (err) => toast.error((err as Error).message),
  });

  const listings = data?.data ?? [];

  return (
    <div className="flex flex-1 flex-col">
      <SiteHeader />

      <main className="mx-auto w-full max-w-[1120px] px-6 pt-10">
        <div className="mb-7 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="mb-1 text-[28px] font-semibold tracking-tight">Your listings</h1>
            <p className="text-[15px] text-muted-foreground">
              {isPending
                ? "Loading…"
                : `${listings.length} ${listings.length === 1 ? "property" : "properties"}`}
            </p>
          </div>
          <div className="flex items-center gap-2.5">
            <Button nativeButton={false} variant="outline" render={<Link href="/host/bookings" />}>
              Reservations
            </Button>
            <Button nativeButton={false} render={<Link href="/host/listing" />}>
              <Plus />
              Add property
            </Button>
          </div>
        </div>

        {isError ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-sm text-destructive">{(error as Error).message}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              Try again
            </Button>
          </div>
        ) : isPending ? (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[280px] animate-pulse rounded-xl border border-border bg-muted/40" />
            ))}
          </div>
        ) : listings.length === 0 ? (
          <EmptyState />
        ) : (
          <section className="grid grid-cols-[repeat(auto-fill,minmax(300px,1fr))] gap-6">
            {listings.map((p) => (
              <ListingCard
                key={p.id}
                property={p}
                onToggle={() => toggleMutation.mutate({ id: p.id, active: !p.isActive })}
                onRemove={() => removeMutation.mutate(p.id)}
                busy={
                  (toggleMutation.isPending && toggleMutation.variables?.id === p.id) ||
                  (removeMutation.isPending && removeMutation.variables === p.id)
                }
              />
            ))}
          </section>
        )}

        <SiteFooter className="mt-18" />
      </main>
    </div>
  );
}

function ListingCard({
  property,
  onToggle,
  onRemove,
  busy,
}: {
  property: HostProperty;
  onToggle: () => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card transition-[border-color,box-shadow] hover:border-ring hover:shadow-sm">
      <div
        className="relative flex aspect-[16/10] items-center justify-center"
        style={{ backgroundImage: PHOTO_STRIPES }}
      >
        {property.images[0] ? (
          <Image
            src={photoUrl(property.images[0])}
            alt={property.title}
            fill
            sizes="(max-width: 640px) 100vw, 360px"
            className="object-cover"
          />
        ) : (
          <span className="font-mono text-[11px] text-muted-foreground">no photo</span>
        )}
        <span className="absolute top-2.5 left-2.5">
          <Badge variant={property.isActive ? "secondary" : "outline"}>
            {property.isActive ? "Active" : "Inactive"}
          </Badge>
        </span>
      </div>
      <div className="p-4">
        <div className="text-[15px] font-semibold tracking-tight">{property.title}</div>
        <div className="mt-0.5 inline-flex items-center gap-1.5 text-[13px] text-muted-foreground">
          <MapPin className="size-3.5" />
          {property.city}
        </div>
        <div className="mt-3 flex items-center gap-4 text-[13px] text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Tag className="size-3.5" />
            <strong className="font-semibold text-foreground">
              {formatPrice(property.pricePerNight)}
            </strong>{" "}
            / night
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Home className="size-3.5" />
            {property.maxGuests} guests
          </span>
        </div>
        <div className="mt-4 flex items-center gap-2">
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            className="flex-1"
            render={<Link href={`/properties/${property.id}`} />}
          >
            View
          </Button>
          <Button
            nativeButton={false}
            variant="outline"
            size="sm"
            render={<Link href={`/host/properties/${property.id}/edit`} />}
          >
            Edit
          </Button>
          <Button variant="ghost" size="sm" onClick={onToggle} disabled={busy}>
            {busy ? (
              <Loader2 className="animate-spin" />
            ) : property.isActive ? (
              "Deactivate"
            ) : (
              "Activate"
            )}
          </Button>
          <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <AlertDialogTrigger render={<Button variant="destructive" size="sm" disabled={busy} />}>
              Remove
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Remove &quot;{property.title}&quot;?</AlertDialogTitle>
                <AlertDialogDescription>This can&apos;t be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  variant="destructive"
                  onClick={() => {
                    // AlertDialogAction is a plain Button (no Close): close
                    // explicitly so a pending mutation can't be double-fired.
                    setConfirmOpen(false);
                    onRemove();
                  }}
                >
                  Remove
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex flex-col items-center rounded-xl border border-border px-6 py-20 text-center">
      <div className="mb-5 flex size-14 items-center justify-center rounded-lg border border-border text-muted-foreground">
        <Home className="size-6" />
      </div>
      <h2 className="text-[19px] font-semibold tracking-tight">You haven&apos;t listed a place yet</h2>
      <p className="mt-1.5 max-w-90 text-sm text-muted-foreground text-pretty">
        List your first property to start welcoming guests. It only takes a few minutes.
      </p>
      <Button nativeButton={false} className="mt-[22px]" render={<Link href="/host/listing" />}>
        <Plus />
        List your place
      </Button>
    </div>
  );
}
