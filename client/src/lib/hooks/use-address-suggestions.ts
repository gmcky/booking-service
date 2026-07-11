import * as React from "react";
import type { AddressSuggestion } from "@/lib/api/properties";

/**
 * Debounced suggestion fetching for an autocomplete field. Failures resolve
 * to an empty list — the helper is best-effort, typing by hand always works.
 * Pass `fetcher` through useCallback: its identity gates refetches.
 */
export function useAddressSuggestions(
  query: string,
  fetcher: (q: string) => Promise<AddressSuggestion[]>,
  minChars = 2,
): AddressSuggestion[] {
  const [suggestions, setSuggestions] = React.useState<AddressSuggestion[]>([]);

  React.useEffect(() => {
    const q = query.trim();
    if (q.length < minChars) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        const result = await fetcher(q);
        if (!cancelled) setSuggestions(result);
      } catch {
        if (!cancelled) setSuggestions([]);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [query, fetcher, minChars]);

  return suggestions;
}
