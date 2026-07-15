/**
 * Refcounted body scroll lock. Two overlays can overlap (fullscreen map,
 * mobile search flow) — naive "save previous value and restore it" locks
 * interleave badly: whichever closes last restores the OTHER lock's
 * "hidden" and the page freezes for good. A counter makes release order
 * irrelevant: the body unlocks exactly when the last holder lets go.
 */
let count = 0;

/** Locks body scroll; returns a release function (idempotent). */
export function lockBodyScroll(): () => void {
  count += 1;
  document.body.style.overflow = "hidden";
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count = Math.max(0, count - 1);
    if (count === 0) document.body.style.overflow = "";
  };
}

/**
 * Route-change failsafe: if an inline overflow lingers on <body> while no
 * lock is held (a cleanup that never ran on some device), clear it so a
 * navigation can never inherit a frozen page.
 */
export function clearStaleBodyScrollLock(): void {
  if (count === 0 && document.body.style.overflow === "hidden") {
    document.body.style.overflow = "";
  }
}
