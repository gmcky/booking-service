import * as React from "react";

/**
 * Anti-flicker gate for loading indicators. Returns true only once
 * `loading` has persisted past `delay` — fast responses never surface a
 * skeleton at all — and once shown it stays for at least `minVisible` so
 * the indicator can't flash in and straight back out.
 */
export function useDeferredLoading(loading: boolean, delay = 300, minVisible = 500): boolean {
  const [show, setShow] = React.useState(false);
  const shownAtRef = React.useRef(0);

  React.useEffect(() => {
    if (loading && !show) {
      const t = setTimeout(() => {
        shownAtRef.current = Date.now();
        setShow(true);
      }, delay);
      return () => clearTimeout(t);
    }
    if (!loading && show) {
      const remaining = minVisible - (Date.now() - shownAtRef.current);
      if (remaining <= 0) {
        setShow(false);
        return;
      }
      const t = setTimeout(() => setShow(false), remaining);
      return () => clearTimeout(t);
    }
  }, [loading, show, delay, minVisible]);

  return show;
}
