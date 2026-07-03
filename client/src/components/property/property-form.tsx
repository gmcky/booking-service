"use client";

import * as React from "react";
import { useMutation } from "@tanstack/react-query";
import { ChevronDown, Upload, AlertCircle, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { propertyApi, type PropertyType, type Amenity } from "@/lib/api/properties";
import { amenityLabel } from "@/lib/api/labels";
import { PHOTO_STRIPES, photoUrl } from "@/lib/utils/photo";

const TYPES: { value: PropertyType; label: string }[] = [
  { value: "HOUSE", label: "House" },
  { value: "APARTMENT", label: "Apartment" },
  { value: "HOTEL_ROOM", label: "Hotel room" },
  { value: "MEETING_ROOM", label: "Meeting room" },
];

const CURATED_AMENITIES: Amenity[] = [
  "WIFI",
  "KITCHEN",
  "POOL",
  "PARKING",
  "FIREPLACE",
  "PET_FRIENDLY",
  "AIR_CONDITIONING",
  "TV",
  "WASHER",
];

const MAX_PHOTOS = 10;
const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp"];

export interface PropertyFormValues {
  title: string;
  description: string;
  address: string;
  city: string;
  maxGuests: number;
  pricePerNight: number;
  type: PropertyType;
  amenities: string[];
  rawImagePaths: string[];
}

export interface PropertyFormInitial {
  title: string;
  description: string;
  address: string;
  city: string;
  maxGuests: number;
  pricePerNight: string;
  type: PropertyType;
  amenities: Amenity[];
  images: string[];
}

interface UploadedPhoto {
  path: string;
  previewUrl: string;
}

export function PropertyForm({
  initial,
  submitLabel,
  pendingLabel,
  pending,
  formError: parentError,
  onSubmit,
}: {
  initial?: PropertyFormInitial;
  submitLabel: string;
  pendingLabel: string;
  pending: boolean;
  formError: string;
  onSubmit: (values: PropertyFormValues) => void;
}) {
  const isEdit = Boolean(initial);
  const [title, setTitle] = React.useState(initial?.title ?? "");
  const [description, setDescription] = React.useState(initial?.description ?? "");
  const [address, setAddress] = React.useState(initial?.address ?? "");
  const [city, setCity] = React.useState(initial?.city ?? "");
  const [maxGuests, setMaxGuests] = React.useState(initial ? String(initial.maxGuests) : "");
  const [price, setPrice] = React.useState(initial ? String(Number(initial.pricePerNight)) : "");
  const [type, setType] = React.useState<PropertyType>(initial?.type ?? "HOUSE");
  const [amenities, setAmenities] = React.useState<string[]>(initial?.amenities ?? []);
  const [uploaded, setUploaded] = React.useState<UploadedPhoto[]>([]);
  const [photoError, setPhotoError] = React.useState("");
  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [localError, setLocalError] = React.useState("");
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // Union so an edited listing keeps showing amenities outside the curated set.
  const amenityOptions = React.useMemo(() => {
    const extras = (initial?.amenities ?? []).filter((a) => !CURATED_AMENITIES.includes(a));
    return [...CURATED_AMENITIES, ...extras];
  }, [initial]);

  const uploadMutation = useMutation({
    mutationFn: (files: File[]) => propertyApi.uploadImages(files),
    onError: (err) => setPhotoError((err as Error).message),
  });

  async function onFilesChosen(list: FileList | null) {
    setPhotoError("");
    if (!list || list.length === 0) return;
    const files = Array.from(list);
    if (fileInputRef.current) fileInputRef.current.value = "";

    if (files.some((f) => !PHOTO_TYPES.includes(f.type))) {
      setPhotoError("Only JPEG, PNG, or WebP images are allowed.");
      return;
    }
    if (files.some((f) => f.size > MAX_PHOTO_BYTES)) {
      setPhotoError("Each photo must be 5MB or smaller.");
      return;
    }
    if (uploaded.length + files.length > MAX_PHOTOS) {
      setPhotoError(`Up to ${MAX_PHOTOS} photos per listing.`);
      return;
    }

    const previews = files.map((f) => URL.createObjectURL(f));
    try {
      const { paths } = await uploadMutation.mutateAsync(files);
      setUploaded((prev) => [
        ...prev,
        ...paths.map((path, i) => ({ path, previewUrl: previews[i] })),
      ]);
    } catch {
      previews.forEach((url) => URL.revokeObjectURL(url));
    }
  }

  function removePhoto(path: string) {
    setUploaded((prev) => {
      const photo = prev.find((p) => p.path === path);
      if (photo) URL.revokeObjectURL(photo.previewUrl);
      return prev.filter((p) => p.path !== path);
    });
  }

  // Revoke preview object URLs still held at unmount (e.g. after the
  // post-publish redirect) — removePhoto only covers manual removal.
  const uploadedRef = React.useRef(uploaded);
  uploadedRef.current = uploaded;
  React.useEffect(
    () => () => {
      uploadedRef.current.forEach((p) => URL.revokeObjectURL(p.previewUrl));
    },
    [],
  );

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

  function onSubmitClick() {
    setLocalError("");
    if (!validate()) {
      setLocalError("Fix the highlighted fields before saving.");
      return;
    }
    onSubmit({
      title: title.trim(),
      description: description.trim(),
      address: address.trim(),
      city: city.trim(),
      maxGuests: Number(maxGuests),
      pricePerNight: Number(price),
      type,
      amenities,
      rawImagePaths: uploaded.map((p) => p.path),
    });
  }

  const formError = localError || parentError;

  return (
    <>
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
            {amenityOptions.map((a) => (
              <label key={a} className="flex cursor-pointer items-center gap-2.5 py-1.5 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-primary"
                  checked={amenities.includes(a)}
                  onChange={() => toggleAmenity(a)}
                />
                {amenityLabel(a)}
              </label>
            ))}
          </div>
        </Card>

        <Card className="p-6">
          <h2 className="mb-4 text-[17px] font-semibold tracking-tight">Photos</h2>
          {isEdit ? (
            <>
              {initial!.images.length > 0 ? (
                <div className="mb-3 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">
                  {initial!.images.map((src) => (
                    <div
                      key={src}
                      className="flex aspect-[4/3] items-center justify-center overflow-hidden rounded-lg"
                      style={{ backgroundImage: PHOTO_STRIPES }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photoUrl(src)} alt="" className="size-full object-cover" />
                    </div>
                  ))}
                </div>
              ) : null}
              <p className="text-sm text-muted-foreground">
                Changing photos on an existing listing isn&apos;t supported yet.
              </p>
            </>
          ) : (
            <>
              {uploaded.length > 0 ? (
                <div className="mb-3 grid grid-cols-[repeat(auto-fill,minmax(120px,1fr))] gap-2.5">
                  {uploaded.map((photo) => (
                    <div key={photo.path} className="group relative aspect-[4/3] overflow-hidden rounded-lg">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={photo.previewUrl} alt="" className="size-full object-cover" />
                      <button
                        type="button"
                        aria-label="Remove photo"
                        onClick={() => removePhoto(photo.path)}
                        className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-background/90 text-foreground shadow-sm hover:bg-background"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={uploadMutation.isPending || uploaded.length >= MAX_PHOTOS}
                className="flex w-full flex-col items-center rounded-lg border border-dashed border-border px-7 py-7 text-center transition-colors hover:border-ring disabled:opacity-60"
              >
                <div className="mb-3 flex size-11 items-center justify-center rounded-full border border-border text-muted-foreground">
                  {uploadMutation.isPending ? (
                    <Loader2 className="size-5 animate-spin" />
                  ) : (
                    <Upload className="size-5" />
                  )}
                </div>
                <div className="text-sm font-medium">
                  {uploadMutation.isPending ? "Uploading…" : "Click to add photos"}
                </div>
                <div className="mt-0.5 text-[13px] text-muted-foreground">
                  JPEG, PNG or WebP up to 5MB each, {MAX_PHOTOS} max
                </div>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept={PHOTO_TYPES.join(",")}
                multiple
                hidden
                onChange={(e) => onFilesChosen(e.target.files)}
              />
              {photoError ? (
                <p className="mt-2 text-[13px] text-destructive">{photoError}</p>
              ) : null}
            </>
          )}
        </Card>
      </div>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-[760px] items-center gap-3 px-6 py-3.5">
          {formError ? (
            <span className="inline-flex items-center gap-1.5 text-[13px] text-destructive">
              <AlertCircle className="size-[15px]" />
              {formError}
            </span>
          ) : null}
          <div className="ml-auto flex items-center gap-2.5">
            <Button onClick={onSubmitClick} disabled={pending || uploadMutation.isPending}>
              {pending ? (
                <>
                  <Loader2 className="mr-2 animate-spin" />
                  {pendingLabel}
                </>
              ) : (
                submitLabel
              )}
            </Button>
          </div>
        </div>
      </div>
    </>
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
