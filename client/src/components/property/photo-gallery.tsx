"use client";

import * as React from "react";
import { LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { PHOTO_STRIPES, photoUrl } from "@/lib/utils/photo";
import { cn } from "@/lib/utils";

/**
 * Airbnb-style photo header: one large tile plus up to four small tiles,
 * adapting its grid to the number of available photos. Falls back to the
 * shared "no photo" stripes when the property has none.
 */
export function PhotoGallery({ images, title }: { images: string[]; title: string }) {
  const [open, setOpen] = React.useState(false);
  const shown = images.slice(0, 5);

  return (
    <div id="photos" className="relative mb-10 scroll-mt-32">
      <PhotoGrid images={shown} title={title} />
      {images.length > 1 ? (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger
            render={
              <Button
                variant="outline"
                size="sm"
                className="absolute right-4 bottom-4 gap-1.5 border-foreground/20 bg-background/90 shadow-sm backdrop-blur"
              />
            }
          >
            <LayoutGrid className="size-3.5" />
            Show all photos
          </DialogTrigger>
          <FullGallery images={images} title={title} />
        </Dialog>
      ) : null}
    </div>
  );
}

function PhotoGrid({ images, title }: { images: string[]; title: string }) {
  const count = images.length;

  if (count === 0) {
    return (
      <div className="grid h-[420px] grid-cols-1 gap-2 overflow-hidden rounded-xl">
        <PhotoTile src={null} title={title} />
      </div>
    );
  }

  if (count === 1) {
    return (
      <div className="grid h-[420px] grid-cols-1 gap-2 overflow-hidden rounded-xl">
        <PhotoTile src={images[0]} title={title} />
      </div>
    );
  }

  if (count === 2) {
    return (
      <div className="grid h-[420px] grid-cols-2 gap-2 overflow-hidden rounded-xl">
        {images.map((src, i) => (
          <PhotoTile key={i} src={src} title={title} />
        ))}
      </div>
    );
  }

  if (count === 3) {
    return (
      <div className="grid h-[420px] grid-cols-2 grid-rows-2 gap-2 overflow-hidden rounded-xl">
        <PhotoTile src={images[0]} title={title} className="row-span-2" />
        <PhotoTile src={images[1]} title={title} />
        <PhotoTile src={images[2]} title={title} />
      </div>
    );
  }

  // 4-5 photos: one large tile + a 2x2 grid of small tiles (fewer than 4
  // remaining photos just leave the trailing cell empty).
  return (
    <div className="grid h-[420px] grid-cols-4 grid-rows-2 gap-2 overflow-hidden rounded-xl">
      <PhotoTile src={images[0]} title={title} className="col-span-2 row-span-2" />
      {images.slice(1, 5).map((src, i) => (
        <PhotoTile key={i} src={src} title={title} />
      ))}
    </div>
  );
}

function PhotoTile({
  src,
  title,
  className,
}: {
  src: string | null;
  title: string;
  className?: string;
}) {
  return (
    <div
      className={cn("group flex items-center justify-center overflow-hidden", className)}
      style={{ backgroundImage: PHOTO_STRIPES }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photoUrl(src)}
          alt={title}
          className="size-full object-cover transition duration-500 ease-out group-hover:scale-[1.04] motion-reduce:transition-none motion-reduce:group-hover:scale-100"
        />
      ) : (
        <span className="font-mono text-[11px] text-muted-foreground">no photo</span>
      )}
    </div>
  );
}

function FullGallery({ images, title }: { images: string[]; title: string }) {
  const [active, setActive] = React.useState(0);
  const itemRefs = React.useRef<(HTMLDivElement | null)[]>([]);

  React.useEffect(() => {
    const visible = new Map<number, number>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const index = Number((entry.target as HTMLElement).dataset.index);
          if (entry.isIntersecting) {
            visible.set(index, entry.intersectionRatio);
          } else {
            visible.delete(index);
          }
        }
        if (visible.size > 0) setActive(Math.min(...visible.keys()));
      },
      { threshold: [0, 0.5, 1] },
    );
    for (const el of itemRefs.current) {
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [images.length]);

  return (
    <DialogContent className="inset-0 top-0 left-0 flex h-screen max-h-screen w-screen max-w-none translate-x-0 translate-y-0 flex-col gap-0 overflow-y-auto rounded-none p-0 sm:max-w-none">
      <DialogTitle className="sr-only">{title} — all photos</DialogTitle>
      <div className="sticky top-0 z-10 flex items-center justify-center border-b border-border bg-background/95 py-3 text-sm font-medium backdrop-blur">
        {active + 1} / {images.length}
      </div>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 p-4">
        {images.map((src, i) => (
          <div
            key={i}
            data-index={i}
            ref={(el) => {
              itemRefs.current[i] = el;
            }}
            className="flex items-center justify-center overflow-hidden rounded-lg"
            style={{ backgroundImage: PHOTO_STRIPES }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photoUrl(src)}
              alt={`${title} photo ${i + 1}`}
              className="w-full object-cover"
            />
          </div>
        ))}
      </div>
    </DialogContent>
  );
}
