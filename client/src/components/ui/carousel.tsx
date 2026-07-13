"use client";

import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Generic horizontal scroll-snap carousel — heading row (caller-supplied
 * heading + arrows/page indicator) above a snap-scrolling track. No
 * domain logic: callers control item sizing via `itemClassName` (basis
 * utilities) and pass whatever children they like.
 */
export function Carousel({
  heading,
  itemClassName,
  className,
  children,
}: {
  heading?: React.ReactNode;
  /** Applied to each item's wrapper — typically responsive `basis-*` classes. */
  itemClassName?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const trackRef = React.useRef<HTMLDivElement>(null);
  const [hasOverflow, setHasOverflow] = React.useState(false);
  const [canScrollPrev, setCanScrollPrev] = React.useState(false);
  const [canScrollNext, setCanScrollNext] = React.useState(false);
  const [page, setPage] = React.useState(1);
  const [pageCount, setPageCount] = React.useState(1);

  const measure = React.useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth - clientWidth > 1;
    setHasOverflow(overflow);
    setCanScrollPrev(scrollLeft > 1);
    setCanScrollNext(scrollLeft < scrollWidth - clientWidth - 1);
    if (clientWidth > 0) {
      // Ceil, not round: a trailing partial viewport is still a page, and the
      // track can only scroll to scrollWidth - clientWidth, so the current
      // page is derived from the trailing edge (scrollLeft + clientWidth).
      const pages = Math.max(1, Math.ceil((scrollWidth - 1) / clientWidth));
      setPageCount(pages);
      setPage(Math.min(pages, Math.max(1, Math.ceil((scrollLeft + clientWidth - 1) / clientWidth))));
    }
  }, []);

  React.useEffect(() => {
    const el = trackRef.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(el);
    window.addEventListener("resize", measure);
    return () => {
      el.removeEventListener("scroll", measure);
      resizeObserver.disconnect();
      window.removeEventListener("resize", measure);
    };
    // Re-measure whenever the set of items changes (e.g. data loads in).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [measure, children]);

  function scrollByPage(direction: 1 | -1) {
    trackRef.current?.scrollBy({ left: direction * trackRef.current.clientWidth, behavior: "smooth" });
  }

  return (
    <div className={className}>
      <div className="mb-[18px] flex items-center justify-between gap-4">
        {heading}
        {hasOverflow ? (
          <div className="flex shrink-0 items-center gap-2.5">
            <span className="font-mono text-[11px] text-muted-foreground">
              {page} / {pageCount}
            </span>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-full transition-opacity duration-300 disabled:opacity-40"
              aria-label="Previous"
              disabled={!canScrollPrev}
              onClick={() => scrollByPage(-1)}
            >
              <ChevronLeft className="size-4" />
            </Button>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              className="rounded-full transition-opacity duration-300 disabled:opacity-40"
              aria-label="Next"
              disabled={!canScrollNext}
              onClick={() => scrollByPage(1)}
            >
              <ChevronRight className="size-4" />
            </Button>
          </div>
        ) : null}
      </div>
      <div
        ref={trackRef}
        className="scrollbar-hide flex snap-x snap-mandatory overflow-x-auto scroll-smooth"
      >
        {React.Children.map(children, (child) => (
          <div className={cn("shrink-0 snap-start pr-4 last:pr-0", itemClassName)}>{child}</div>
        ))}
      </div>
    </div>
  );
}
