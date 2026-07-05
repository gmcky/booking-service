"use client";

import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { amenityLabel } from "@/lib/api/labels";
import { amenityIcon } from "@/lib/api/amenity-icons";
import type { Amenity } from "@/lib/api/properties";

const PREVIEW_COUNT = 10;

export function AmenitiesSection({ amenities }: { amenities: Amenity[] }) {
  const [open, setOpen] = React.useState(false);
  if (amenities.length === 0) return null;

  const preview = amenities.slice(0, PREVIEW_COUNT);
  const hasMore = amenities.length > PREVIEW_COUNT;

  return (
    <div id="amenities" className="scroll-mt-32 border-b border-border py-6">
      <h2 className="mb-[18px] text-[19px] font-semibold tracking-tight">
        What this place offers
      </h2>
      <div className="grid grid-cols-1 gap-x-6 gap-y-4 sm:grid-cols-2">
        {preview.map((a) => (
          <AmenityRow key={a} amenity={a} />
        ))}
      </div>
      {hasMore ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger render={<Button variant="outline" className="mt-5" />}>
            Show all {amenities.length} amenities
          </DialogTrigger>
          <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-md">
            <DialogHeader>
              <DialogTitle>What this place offers</DialogTitle>
            </DialogHeader>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {amenities.map((a) => (
                <AmenityRow key={a} amenity={a} />
              ))}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </div>
  );
}

function AmenityRow({ amenity }: { amenity: Amenity }) {
  const Icon = amenityIcon(amenity);
  return (
    <div className="flex items-center gap-3 text-sm">
      <Icon className="size-[18px] shrink-0 text-muted-foreground" />
      {amenityLabel(amenity)}
    </div>
  );
}
