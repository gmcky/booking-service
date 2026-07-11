"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PropertyForm, type PropertyFormValues } from "@/components/property/property-form";
import { propertyApi } from "@/lib/api/properties";
import { queryKeys } from "@/lib/query/keys";

export function PropertyEditView({ id }: { id: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = React.useState("");

  const { data, isPending, isError, error } = useQuery({
    queryKey: queryKeys.properties.detail(id),
    queryFn: () => propertyApi.byId(id),
  });

  const mutation = useMutation({
    mutationFn: (values: PropertyFormValues) => {
      // PATCH takes finalized image URLs only; photos stay unchanged on edit.
      const { rawImagePaths: _ignored, ...rest } = values;
      return propertyApi.update(id, rest);
    },
    onSuccess: () => {
      toast.success("Listing updated");
      queryClient.invalidateQueries({ queryKey: queryKeys.properties.all });
      router.push("/host/properties");
    },
    onError: (err) => setFormError((err as Error).message),
  });

  return (
    <div className="flex flex-1 flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[760px] items-center gap-4 px-6">
          <Link
            href="/host/properties"
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="size-[15px]" />
            Listings
          </Link>
          <div className="ml-auto inline-flex items-center gap-2">
            <span className="font-mono text-xs text-muted-foreground">Editing</span>
            <Badge variant="ghost">{data?.title ?? "…"}</Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-6 pt-9 pb-32">
        <h1 className="mb-7 text-[27px] font-semibold tracking-tight">Edit listing</h1>

        {isPending ? (
          <div className="flex flex-col gap-5">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-40 animate-pulse rounded-xl border border-border bg-muted/40" />
            ))}
          </div>
        ) : isError ? (
          <div className="flex flex-col items-center gap-4 py-16 text-center">
            <p className="text-sm text-destructive">{(error as Error).message}</p>
            <Button nativeButton={false} variant="outline" render={<Link href="/host/properties" />}>
              Back to listings
            </Button>
          </div>
        ) : (
          <PropertyForm
            initial={{
              title: data.title,
              description: data.description,
              street: data.street,
              houseNumber: data.houseNumber,
              apartment: data.apartment,
              district: data.district,
              city: data.city,
              country: data.country,
              maxGuests: data.maxGuests,
              pricePerNight: data.pricePerNight,
              type: data.type,
              petsAllowed: data.petsAllowed,
              infantsAllowed: data.infantsAllowed,
              amenities: data.amenities,
              images: data.images,
            }}
            submitLabel="Save changes"
            pendingLabel="Saving…"
            pending={mutation.isPending}
            formError={formError}
            onSubmit={(values) => {
              setFormError("");
              mutation.mutate(values);
            }}
          />
        )}
      </main>
    </div>
  );
}
