"use client";

import * as React from "react";
import {
  animate,
  motion,
  useDragControls,
  useMotionValue,
  useReducedMotion,
} from "motion/react";
import { Loader2 } from "lucide-react";

export type SheetSnap = "peek" | "half" | "full";

/** Sheet height as a share of the map overlay. A strip of map stays visible
 *  even at full, so the sheet never reads as a page of its own. */
const HEIGHT_RATIO = 0.9;
/** Share of the overlay the sheet covers at the half snap. Sized so the
 *  selected listing card fits with a strip of the next card still showing —
 *  that strip is what says the list continues under it. */
const HALF_RATIO = 0.6;
/** Grabber plus the count row — what "closed" still shows. */
const PEEK_PX = 104;

const SNAP_ORDER: SheetSnap[] = ["peek", "half", "full"];

export interface MapListSheetProps {
  /** Result count for the handle row — this replaces the old "Show list · N". */
  count: number;
  /** Handle shows a spinner instead of the count while results are in flight. */
  searching: boolean;
  snap: SheetSnap;
  onSnapChange: (snap: SheetSnap) => void;
  /**
   * The listing a pin tap selected. The caller renders it as the first card,
   * so all the sheet does here is return its own scroller to the top.
   *
   * It used to call `scrollIntoView` on the matching card instead, which is
   * the bug this replaced: that scrolls *every* scrollable ancestor, and the
   * sheet hangs out of the bottom of the map overlay while it's translated
   * down, so the overlay itself got scrolled and dragged the whole sheet up
   * with it. The list looked like it had jumped to a different listing.
   */
  selectedId?: string | null;
  /**
   * The sheet's scroll container, handed back so the caller's paging sentinel
   * can observe against it instead of against the viewport (the page behind
   * the map is scroll-locked, so the viewport never scrolls here).
   */
  scrollRef: React.RefObject<HTMLDivElement | null>;
  children: React.ReactNode;
}

/**
 * Draggable list sheet over the full-screen mobile map.
 *
 * A 50/50 split was the obvious answer and the wrong one: at 390x844 both
 * halves fail at once — a map too small to read above a list showing one and a
 * half cards. Three snap points let the visitor pick the ratio per moment
 * instead of living with a fixed one.
 *
 * Only the handle starts a drag (`dragListener={false}` plus explicit
 * `dragControls`). Letting the body drag too means every gesture has to be
 * arbitrated against the list's own scrolling, which is exactly the
 * gesture/scroll-lock tangle that has frozen this overlay before.
 */
export function MapListSheet({
  count,
  searching,
  snap,
  onSnapChange,
  selectedId,
  scrollRef,
  children,
}: MapListSheetProps) {
  const sheetRef = React.useRef<HTMLDivElement | null>(null);
  const dragControls = useDragControls();
  const reduceMotion = useReducedMotion();
  const y = useMotionValue(0);
  const [height, setHeight] = React.useState(0);

  const transition = React.useMemo(
    () =>
      reduceMotion
        ? ({ duration: 0 } as const)
        : ({ type: "spring", stiffness: 420, damping: 42, mass: 0.9 } as const),
    [reduceMotion],
  );

  /** Offsets are translate-downs from the fully open position. */
  const offsets = React.useMemo(
    () => ({
      full: 0,
      half: Math.max(0, height - (HALF_RATIO / HEIGHT_RATIO) * height),
      peek: Math.max(0, height - PEEK_PX),
    }),
    [height],
  );

  const snapRef = React.useRef(snap);
  snapRef.current = snap;

  // Layout effect, not effect: the sheet's own height is what the offsets are
  // built from, so measuring after paint would show it fully open for a frame
  // before it drops to peek.
  React.useLayoutEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const measure = () => setHeight(el.offsetHeight);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Height changes come from the viewport (a mobile URL bar hiding), not from
  // the visitor — reposition without animating, or the sheet slides on its own.
  React.useLayoutEffect(() => {
    if (!height) return;
    y.set(offsets[snapRef.current]);
  }, [height, offsets, y]);

  React.useEffect(() => {
    if (!height) return;
    animate(y, offsets[snap], transition);
  }, [snap, height, offsets, transition, y]);

  React.useEffect(() => {
    if (!selectedId) return;
    // Direct assignment, never scrollIntoView — see the prop's note.
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [selectedId, scrollRef]);

  // A drag that ends over the handle still produces a trailing click, and the
  // click handler can't tell it from a tap — without this the sheet would
  // settle where the finger left it and then cycle one snap further. Framer
  // only fires onDragStart past its own threshold, so a jittery tap still
  // counts as a tap.
  const draggedRef = React.useRef(false);

  function settle(velocity: number) {
    // Project the flick a little so a fast swipe reaches the next snap even
    // when the finger let go short of it.
    const projected = y.get() + velocity * 0.08;
    let next: SheetSnap = "peek";
    for (const candidate of SNAP_ORDER) {
      if (Math.abs(offsets[candidate] - projected) < Math.abs(offsets[next] - projected)) {
        next = candidate;
      }
    }
    // Animated here rather than left to the snap effect: settling back into the
    // snap the drag started from wouldn't change the prop, so nothing would
    // pull the sheet off the position the finger left it at.
    animate(y, offsets[next], transition);
    if (next !== snap) onSnapChange(next);
  }

  const label = searching
    ? "Searching…"
    : `${count} ${count === 1 ? "home" : "homes"}`;

  return (
    <motion.div
      ref={sheetRef}
      style={{ y, height: `${HEIGHT_RATIO * 100}%` }}
      drag="y"
      dragListener={false}
      dragControls={dragControls}
      dragConstraints={{ top: offsets.full, bottom: offsets.peek }}
      dragElastic={0.04}
      dragMomentum={false}
      onDragStart={() => {
        draggedRef.current = true;
      }}
      onDragEnd={(_, info) => settle(info.velocity.y)}
      className="absolute inset-x-0 bottom-0 z-30 flex flex-col overflow-hidden rounded-t-2xl border border-border bg-card shadow-[0_-8px_30px_-12px_rgb(0_0_0/0.3)] lg:hidden"
    >
      <button
        type="button"
        // The whole header is the drag surface; touch-action keeps the browser
        // from claiming the gesture as a page scroll first.
        style={{ touchAction: "none" }}
        onPointerDown={(event) => {
          draggedRef.current = false;
          dragControls.start(event);
        }}
        onClick={() => {
          if (draggedRef.current) {
            draggedRef.current = false;
            return;
          }
          // Two states on tap, on purpose: open or closed. Cycling three
          // states through one control meant two taps to get anywhere and a
          // guess about which one you'd land on. Full is still there — it's
          // reached by dragging, which is the gesture that asks for "more".
          onSnapChange(snap === "peek" ? "half" : "peek");
        }}
        aria-label={snap === "peek" ? "Expand list" : "Collapse list"}
        aria-expanded={snap !== "peek"}
        className="shrink-0 cursor-grab px-4 pt-2.5 pb-3 active:cursor-grabbing"
      >
        <div className="mx-auto h-1 w-9 rounded-full bg-border" />
        <div className="mt-2.5 flex items-center justify-center gap-2 text-sm font-semibold">
          {searching ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" /> : null}
          {label}
        </div>
      </button>

      <div
        ref={scrollRef}
        // Peek is a handle, not a list: scrolling content nobody can see would
        // only fire the paging sentinel behind the visitor's back.
        // pt-1 keeps the selected card's ring off the scroller's top edge,
        // which was clipping it into a half-drawn border.
        className={`min-h-0 flex-1 overscroll-contain px-4 pt-1 pb-[calc(1.5rem+env(safe-area-inset-bottom))] ${
          snap === "peek" ? "overflow-hidden" : "overflow-y-auto"
        }`}
      >
        {children}
      </div>
    </motion.div>
  );
}
