"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { favoriteApi } from "@/lib/api/favorites";
import { queryKeys } from "@/lib/query/keys";
import { useAuthStore } from "@/lib/auth/store";

/**
 * Favorited-property ids for the current user, plus an optimistic toggle.
 * Card hearts and the detail-page Save button share this single ids query —
 * TanStack Query dedupes the request and every consumer stays in sync.
 */
export function useFavorites() {
  const status = useAuthStore((s) => s.status);
  const authed = status === "authed";
  const queryClient = useQueryClient();

  const idsQuery = useQuery({
    queryKey: queryKeys.favorites.ids,
    queryFn: () => favoriteApi.ids(),
    enabled: authed,
  });

  const ids = React.useMemo(() => new Set(idsQuery.data ?? []), [idsQuery.data]);

  const toggleMutation = useMutation<
    void,
    Error,
    { propertyId: string; next: boolean },
    { previous?: string[] }
  >({
    mutationFn: async ({ propertyId, next }) => {
      if (next) await favoriteApi.add(propertyId);
      else await favoriteApi.remove(propertyId);
    },
    onMutate: async ({ propertyId, next }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.favorites.ids });
      const previous = queryClient.getQueryData<string[]>(queryKeys.favorites.ids);
      queryClient.setQueryData<string[]>(queryKeys.favorites.ids, (old) => {
        const set = new Set(old ?? []);
        if (next) set.add(propertyId);
        else set.delete(propertyId);
        return Array.from(set);
      });
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.favorites.ids, context.previous);
      }
      toast.error("Couldn't update your favorites. Please try again.");
    },
    onSettled: (_data, _err, { propertyId }) => {
      pendingRef.current.delete(propertyId);
      queryClient.invalidateQueries({ queryKey: queryKeys.favorites.ids });
      queryClient.invalidateQueries({ queryKey: ["favorites", "list"] });
    },
  });

  // One in-flight mutation per property — a rapid double-click would fire
  // add+remove with no guaranteed completion order on the server.
  const pendingRef = React.useRef(new Set<string>());

  function isFavorite(propertyId: string): boolean {
    return ids.has(propertyId);
  }

  function toggle(propertyId: string) {
    if (pendingRef.current.has(propertyId)) return;
    pendingRef.current.add(propertyId);
    toggleMutation.mutate({ propertyId, next: !ids.has(propertyId) });
  }

  return { isAuthed: authed, isFavorite, toggle, ids };
}
