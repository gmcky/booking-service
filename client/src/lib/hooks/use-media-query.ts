"use client";

import * as React from "react";

/** Reactive `matchMedia`. False on the server / first paint, then resolves on
 *  mount — fine for client-only UI like the mobile map overlay. */
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
