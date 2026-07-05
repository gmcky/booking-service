"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { formatPrice } from "@/lib/utils/money";
import { cn } from "@/lib/utils";

const NAV_SECTIONS = [
  { id: "photos", label: "Photos" },
  { id: "amenities", label: "Amenities" },
  { id: "reviews", label: "Reviews" },
  { id: "location", label: "Location" },
] as const;

function scrollToElement(el: Element | null) {
  if (!el) return;
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
}

/**
 * Sticky-below-header nav that appears once the user scrolls past the photo
 * grid (tracked via `sentinelRef`, a marker rendered right after it). Shows
 * anchor links with scroll-spy plus a compact price + Reserve shortcut that
 * jumps to the booking card.
 */
export function SectionNav({
  sentinelRef,
  bookingCardRef,
  pricePerNight,
}: {
  sentinelRef: React.RefObject<HTMLElement | null>;
  bookingCardRef: React.RefObject<HTMLElement | null>;
  pricePerNight: string;
}) {
  const [visible, setVisible] = React.useState(false);
  const [active, setActive] = React.useState<string | null>(null);

  React.useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(!entry.isIntersecting));
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [sentinelRef]);

  React.useEffect(() => {
    const elements = NAV_SECTIONS.map((s) => document.getElementById(s.id)).filter(
      (el): el is HTMLElement => el !== null,
    );
    if (elements.length === 0) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries.find((entry) => entry.isIntersecting);
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-140px 0px -60% 0px", threshold: 0 },
    );
    for (const el of elements) observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      className={cn(
        "fixed inset-x-0 top-16 z-30 border-b border-border bg-background/95 backdrop-blur transition-[opacity,transform] motion-safe:duration-200 motion-reduce:transition-none",
        visible ? "translate-y-0 opacity-100" : "pointer-events-none -translate-y-2 opacity-0",
      )}
      aria-hidden={!visible}
    >
      <div className="mx-auto flex w-full max-w-[1120px] items-center justify-between gap-4 px-6 py-3">
        <nav className="flex gap-5 text-sm">
          {NAV_SECTIONS.map((s) => (
            <button
              key={s.id}
              type="button"
              tabIndex={visible ? 0 : -1}
              onClick={() => scrollToElement(document.getElementById(s.id))}
              className={cn(
                "border-b-2 border-transparent pb-0.5 text-muted-foreground transition-colors hover:text-foreground",
                active === s.id && "border-foreground text-foreground",
              )}
            >
              {s.label}
            </button>
          ))}
        </nav>
        <div className="flex shrink-0 items-center gap-3">
          <span className="text-sm">
            <strong className="font-semibold">{formatPrice(pricePerNight)}</strong>{" "}
            <span className="text-muted-foreground">night</span>
          </span>
          <Button
            size="sm"
            tabIndex={visible ? 0 : -1}
            onClick={() => scrollToElement(bookingCardRef.current)}
          >
            Reserve
          </Button>
        </div>
      </div>
    </div>
  );
}
