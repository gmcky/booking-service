"use client";

import * as React from "react";

/**
 * Makes a full-screen overlay own a history entry, so the browser's Back (and
 * the hardware button on a phone) closes the overlay instead of leaving the
 * page underneath it. Without this, opening the photo gallery on a listing and
 * pressing Back drops the user wherever they came from, usually home.
 *
 * The entry is pushed on open and popped again if the overlay is closed by its
 * own UI, so Back and the close button leave the history in the same state.
 *
 * Returns a release function for overlays that close by navigating somewhere
 * (the mobile search flow closes itself on submit): call it before the
 * navigation so the entry is left alone instead of popped, which would undo
 * the navigation that just happened.
 */
export function useOverlayHistory(open: boolean, onClose: () => void): () => void {
  const closeRef = React.useRef(onClose);
  closeRef.current = onClose;
  const ownedRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) return;

    // Same URL, marker state only: the overlay isn't a route, it's a layer on
    // top of one. Next's router tolerates a bare pushState like this.
    window.history.pushState({ ...window.history.state, overlay: true }, "");
    ownedRef.current = true;

    const onPopState = () => {
      // Our entry is already gone by the time this fires.
      ownedRef.current = false;
      closeRef.current();
    };
    window.addEventListener("popstate", onPopState);

    return () => {
      window.removeEventListener("popstate", onPopState);
      // Closed by the UI rather than by Back, so drop the entry we added.
      if (ownedRef.current) {
        ownedRef.current = false;
        window.history.back();
      }
    };
  }, [open]);

  return React.useCallback(() => {
    ownedRef.current = false;
  }, []);
}
