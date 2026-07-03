import { apiClient } from "./client";
import { unwrap, unwrapVoid } from "./unwrap";
import type { components, paths } from "./schema";
import type { Paginated } from "./properties";

export type Review = components["schemas"]["Review"];
export type ReviewStats = components["schemas"]["ReviewStats"];
export type ReviewSort = "recent" | "highest" | "lowest";

export type ReviewReport =
  paths["/reviews/{id}/report"]["post"]["responses"]["201"]["content"]["application/json"];

export interface ReviewQuery {
  page?: number;
  limit?: number;
  sort?: ReviewSort;
  rating?: number;
  hasHostReply?: boolean;
}

export const reviewApi = {
  list: async (propertyId: string, query: ReviewQuery = {}): Promise<Paginated<Review>> => {
    const { data, error, response } = await apiClient.GET("/reviews/property/{propertyId}", {
      params: {
        path: { propertyId },
        query: {
          page: query.page,
          limit: query.limit,
          sort: query.sort,
          rating: query.rating,
          hasHostReply: query.hasHostReply,
        },
      },
    });
    return unwrap({ data, error, response });
  },

  stats: async (propertyId: string): Promise<ReviewStats> => {
    const { data, error, response } = await apiClient.GET("/reviews/property/{propertyId}/stats", {
      params: { path: { propertyId } },
    });
    return unwrap({ data, error, response });
  },

  create: async (input: { bookingId: string; rating: number; comment?: string }): Promise<Review> => {
    const { data, error, response } = await apiClient.POST("/reviews", {
      body: input,
    });
    return unwrap({ data, error, response });
  },

  update: async (id: string, input: { rating?: number; comment?: string }): Promise<Review> => {
    const { data, error, response } = await apiClient.PATCH("/reviews/{id}", {
      params: { path: { id } },
      body: input,
    });
    return unwrap({ data, error, response });
  },

  remove: async (id: string): Promise<void> => {
    const { error, response } = await apiClient.DELETE("/reviews/{id}", {
      params: { path: { id } },
    });
    unwrapVoid({ error, response });
  },

  reply: async (id: string, text: string): Promise<Review> => {
    const { data, error, response } = await apiClient.PATCH("/reviews/{id}/reply", {
      params: { path: { id } },
      body: { text },
    });
    return unwrap({ data, error, response });
  },

  report: async (id: string, reason: string): Promise<ReviewReport> => {
    const { data, error, response } = await apiClient.POST("/reviews/{id}/report", {
      params: { path: { id } },
      body: { reason },
    });
    return unwrap({ data, error, response });
  },
};
