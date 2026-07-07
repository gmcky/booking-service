import { apiClient } from "./client";
import { unwrap, unwrapVoid } from "./unwrap";
import type { components } from "./schema";
import type { Paginated } from "./properties";

export type Favorite = components["schemas"]["Favorite"];

export interface FavoriteQuery {
  page?: number;
  limit?: number;
}

export const favoriteApi = {
  add: async (propertyId: string): Promise<Favorite> => {
    const { data, error, response } = await apiClient.POST("/favorites/{propertyId}", {
      params: { path: { propertyId } },
    });
    return unwrap({ data, error, response });
  },

  remove: async (propertyId: string): Promise<void> => {
    const { error, response } = await apiClient.DELETE("/favorites/{propertyId}", {
      params: { path: { propertyId } },
    });
    unwrapVoid({ error, response });
  },

  list: async (query: FavoriteQuery = {}): Promise<Paginated<Favorite>> => {
    const { data, error, response } = await apiClient.GET("/favorites", {
      params: { query: { page: query.page, limit: query.limit } },
    });
    return unwrap({ data, error, response });
  },

  ids: async (): Promise<string[]> => {
    const { data, error, response } = await apiClient.GET("/favorites/ids");
    return unwrap({ data, error, response }).ids;
  },
};
