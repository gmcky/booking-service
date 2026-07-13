"use client";

import * as React from "react";

/**
 * Reactive `matchMedia`. Starts false on the server / first paint, then
 * resolves on mount — callers that need SSR-stable output should gate on
 * something else, but for client-only UI (e.g. a mobile map overlay) this is
 * fine.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = React.useState(false);

  React.useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    onChange();
    mql.addEventListener("change", onChange);
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}
