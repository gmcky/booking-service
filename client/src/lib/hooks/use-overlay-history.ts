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
      if (!ownedRef.current) return;
      ownedRef.current = false;

      // Whatever the overlay wrote into the query string while it was open
      // belongs to the page, not to the entry being dropped. Going back alone
      // would restore the URL as it stood when the overlay opened — the browse
      // map rewrites its area on every pan, so closing it rewound the list to
      // an area the visitor had already left.
      const url = window.location.href;
      const state = window.history.state;
      const restore = () => {
        window.removeEventListener("popstate", restore);
        // A tick later, not inside the handler: the router processes the same
        // popstate and rebuilds its own view of the URL from the entry being
        // restored, so a replaceState issued during the event is overwritten
        // and the page keeps rendering the search it just left.
        setTimeout(() => {
          window.history.replaceState(state, "", url);
          // Tell the router to re-read the address bar: it has just rebuilt its
          // own view of the URL from the popped entry, and a bare replaceState
          // leaves the two disagreeing — the address says one search, the page
          // renders another.
          window.dispatchEvent(new PopStateEvent("popstate", { state }));
        }, 0);
      };
      window.addEventListener("popstate", restore);
      window.history.back();
    };
  }, [open]);

  return React.useCallback(() => {
    ownedRef.current = false;
  }, []);
}
