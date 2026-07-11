"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { PropertyForm, type PropertyFormValues } from "@/components/property/property-form";
import { propertyApi } from "@/lib/api/properties";
import { queryKeys } from "@/lib/query/keys";

export default function HostListingPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [formError, setFormError] = React.useState("");

  const mutation = useMutation({
    // Create takes optional fields as absent, not null (only PATCH clears).
    mutationFn: ({ houseNumber, apartment, district, ...values }: PropertyFormValues) =>
      propertyApi.create({
        ...values,
        houseNumber: houseNumber ?? undefined,
        apartment: apartment ?? undefined,
        district: district ?? undefined,
      }),
    onSuccess: () => {
      toast.success("Listing published");
      queryClient.invalidateQueries({ queryKey: queryKeys.properties.mine });
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
            <span className="font-mono text-xs text-muted-foreground">Draft</span>
            <Badge variant="ghost">Unpublished</Badge>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[760px] px-6 pt-9 pb-32">
        <h1 className="mb-7 text-[27px] font-semibold tracking-tight">New listing</h1>
        <PropertyForm
          submitLabel="Publish"
          pendingLabel="Publishing…"
          pending={mutation.isPending}
          formError={formError}
          onSubmit={(values) => {
            setFormError("");
            mutation.mutate(values);
          }}
        />
      </main>
    </div>
  );
}
