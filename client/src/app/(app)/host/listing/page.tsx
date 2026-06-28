"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation } from "@tanstack/react-query";
import { ArrowLeft, ChevronDown, Upload, AlertCircle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { propertyApi, type PropertyType } from "@/lib/api/properties";

const TYPES: { value: PropertyType; label: string }[] = [
  { value: "HOUSE", label: "House" },
  { value: "APARTMENT", label: "Apartment" },
  { value: "HOTEL_ROOM", label: "Hotel room" },
  { value: "MEETING_ROOM", label: "Meeting room" },
];

const AMENITIES: { value: string; label: string }[] = [
  { value: "WIFI", label: "Fast wifi" },
  { value: "KITCHEN", label: "Full kitchen" },
  { value: "POOL", label: "Pool" },
  { value: "PARKING", label: "Free parking" },
  { value: "FIREPLACE", label: "Fireplace" },
  { value: "PET_FRIENDLY", label: "Pet friendly" },
  { value: "AIR_CONDITIONING", label: "Air conditioning" },
  { value: "TV", label: "TV" },
  { value: "WASHER", label: "Washer / dryer" },
];

export default function HostListingPage() {
  const router = useRouter();
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [address, setAddress] = React.useState("");
  const [city, setCity] = React.useState("");
  const [maxGuests, setMaxGuests] = React.useState("");
  const [price, setPrice] = React.useState("");
  const [type, setType] = React.useState<PropertyType>("HOUSE");
  const [amenities, setAmenities] = React.useState<string[]>([]);
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [formError, setFormError] = React.useState("");

  const mutation = useMutation({
    mutationFn: () =>
      propertyApi.create({
        title: title.trim(),
        description: description.trim(),
        address: address.trim(),
        city: city.trim(),
        maxGuests: Number(maxGuests),
        pricePerNight: Number(price),
        type,
        amenities,
      }),
    onSuccess: () => {
      toast.success("Listing published");
      router.push("/host/properties");
    },
    onError: (err) => setFormError((err as Error).message),
  });

  function toggleAmenity(value: string) {
    setAmenities((prev) =>
      prev.includes(value) ? prev.filter((a) => a !== value) : [...prev, value],
    );
  }

  function validate(): boolean {
    const next: Record<string, string> = {};
    if (title.trim().length < 5) next.title = "Title must be at least 5 characters.";
    if (description.trim().length < 20) next.description = "Write at least 20 characters.";
    if (address.trim().length < 5) next.address = "Enter a street address.";
    if (city.trim().length < 2) next.city = "Enter a city.";
    if (!(Number(maxGuests) > 0)) next.maxGuests = "Set max guests.";
    if (!(Number(price) > 0)) next.price = "Set a nightly price.";
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  function onPublish() {
    setFormError("");
    if (!validate()) {
      setFormError("Fix the highlighted fields before publishing.");
      return;
    }
    mutation.mutate();
  }

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

        <div className="flex flex-col gap-5">
          <Card className="p-6">
            <h2 className="mb-[18px] text-[17px] font-semibold tracking-tight">Basics</h2>
            <div className="flex flex-col gap-4">
              <Field label="Title" htmlFor="title" error={errors.title}>
                <Input
                  id="title"
                  placeholder="e.g. Pine Ridge Cabin"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  aria-invalid={Boolean(errors.title)}
                />
              </Field>
              <Field label="Description" htmlFor="desc" error={errors.description}>
                <textarea
                  id="desc"
                  placeholder="Describe the space, the setting, and what makes it special."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  aria-invalid={Boolean(errors.description)}
                  className="min-h-24 w-full resize-y rounded-lg border border-border bg-background px-3 py-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
                />
              </Field>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="mb-[18px] text-[17px] font-semibold tracking-tight">Location</h2>
            <div className="flex flex-col gap-4">
              <Field label="Street address" htmlFor="addr" error={errors.address}>
                <Input
                  id="addr"
                  placeholder="1240 Lakeshore Dr"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  aria-invalid={Boolean(errors.address)}
                />
              </Field>
              <Field label="City" htmlFor="city" error={errors.city}>
                <Input
                  id="city"
                  placeholder="South Lake Tahoe"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  aria-invalid={Boolean(errors.city)}
                />
              </Field>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="mb-[18px] text-[17px] font-semibold tracking-tight">Details</h2>
            <div className="grid gap-3.5 sm:grid-cols-3">
              <Field label="Max guests" htmlFor="guests" error={errors.maxGuests}>
                <Input
                  id="guests"
                  type="number"
                  min={1}
                  placeholder="6"
                  value={maxGuests}
                  onChange={(e) => setMaxGuests(e.target.value)}
                  aria-invalid={Boolean(errors.maxGuests)}
                />
              </Field>
              <Field label="Price / night" htmlFor="price" error={errors.price}>
                <Input
                  id="price"
                  type="number"
                  min={1}
                  placeholder="248"
                  value={price}
                  onChange={(e) => setPrice(e.target.value)}
                  aria-invalid={Boolean(errors.price)}
                />
              </Field>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="type">Property type</Label>
                <span className="relative flex items-center">
                  <select
                    id="type"
                    value={type}
                    onChange={(e) => setType(e.target.value as PropertyType)}
                    className="h-8 w-full cursor-pointer appearance-none rounded-lg border border-border bg-background pr-7 pl-3 text-sm outline-none"
                  >
                    {TYPES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="pointer-events-none absolute right-2 size-[15px] text-muted-foreground" />
                </span>
              </div>
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="mb-4 text-[17px] font-semibold tracking-tight">Amenities</h2>
            <div className="grid gap-x-6 gap-y-1 sm:grid-cols-3">
              {AMENITIES.map((a) => (
                <label key={a.value} className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary"
                    checked={amenities.includes(a.value)}
                    onChange={() => toggleAmenity(a.value)}
                  />
                  {a.label}
                </label>
              ))}
            </div>
          </Card>

          <Card className="p-6">
            <h2 className="text-[17px] font-semibold tracking-tight">Photos</h2>
            <p className="mb-4 text-sm text-muted-foreground">
              Photo upload runs through the S3 pipeline — not wired into this form yet.
            </p>
            <div className="flex flex-col items-center rounded-lg border border-dashed border-border px-7 py-7 text-center opacity-60">
              <div className="mb-3 flex size-11 items-center justify-center rounded-full border border-border text-muted-foreground">
                <Upload className="size-5" />
              </div>
              <div className="text-sm font-medium">Drag photos here, or browse</div>
              <div className="mt-0.5 text-[13px] text-muted-foreground">PNG or JPG up to 10MB each</div>
            </div>
          </Card>
        </div>
      </main>

      <div className="sticky bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-[760px] items-center gap-3 px-6 py-3.5">
          {formError ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-destructive">
              <AlertCircle className="size-[15px]" />
              {formError}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2.5">
            <Button onClick={onPublish} disabled={mutation.isPending}>
              {mutation.isPending ? (
                <>
                  <Loader2 className="mr-2 animate-spin" />
                  Publishing…
                </>
              ) : (
                "Publish"
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  htmlFor,
  error,
  children,
}: {
  label: string;
  htmlFor: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {error ? <span className="text-[13px] text-destructive">{error}</span> : null}
    </div>
  );
}
